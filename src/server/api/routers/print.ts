import { router, userProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import {
  hashBufferSha256,
  sanitizeFilename,
  validateGcodePayload,
} from "@/server/api/utils/print/print.utils";

const printerTypeSchema = z.enum(["PRUSA", "BAMBU"]);
const ipAddressSchema = z.string().refine((value) => isIP(value) !== 0, {
  message: "Invalid IP address",
});

const sanitizeDbText = (value: string, maxLength = 4000) =>
  value.replace(/\u0000/g, "").slice(0, maxLength);

const dispatchToPrinter = async (params: {
  printerType: "PRUSA" | "BAMBU";
  ipAddress: string;
  fileBuffer?: Buffer;
  originalFilename: string;
  authToken?: string | null;
  serialNumber?: string | null;
  mode?: "upload_only" | "start_only" | "upload_and_start";
}) => {
  const {
    printerType,
    ipAddress,
    fileBuffer,
    originalFilename,
    authToken,
    serialNumber,
    mode = "upload_and_start",
  } = params;

  if (printerType === "PRUSA") {
    if (!authToken) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Prusa printer requires auth token/API key.",
      });
    }

    type PrusaStatusResponse = {
      storage?: { name?: string; read_only?: boolean };
      printer?: { state?: string };
    };
    const getPrusaStatus = async () => {
      const statusRes = await fetch(`http://${ipAddress}/api/v1/status`, {
        headers: {
          "X-Api-Key": authToken,
        },
      });
      if (!statusRes.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
            message: `Prusa status check failed (${statusRes.status}): ${sanitizeDbText(await statusRes.text())}`,
        });
      }
      return (await statusRes.json()) as PrusaStatusResponse;
    };

    // PrusaLink storage names differ by printer/firmware (e.g. "local" vs "usb").
    // Probe status first and fall back to "local" if unavailable.
    let prusaStorageName = "local";
    let initialPrinterState = "UNKNOWN";
    try {
      const statusJson = await getPrusaStatus();
      const storageName = statusJson.storage?.name?.trim();
      initialPrinterState = statusJson.printer?.state?.trim() ?? "UNKNOWN";
      if (statusJson.storage?.read_only) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prusa storage '${storageName ?? "unknown"}' is read-only.`,
        });
      }
      if (storageName) {
        prusaStorageName = storageName;
      }
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      // Ignore status probe failures; upload attempt below will surface the real error.
    }

    const blockedStates = new Set(["PRINTING", "PAUSED", "BUSY", "ATTENTION"]);
    if (blockedStates.has(initialPrinterState.toUpperCase())) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Printer is not ready to start a new job (state=${initialPrinterState}).`,
      });
    }

    const storageCandidates = Array.from(
      new Set([prusaStorageName, "local", "usb"].filter(Boolean)),
    );
    const encodedFilename = encodeURIComponent(originalFilename);
    const uploadEndpointCandidates = storageCandidates.flatMap((storage) => [
      {
        path: `/api/v1/files/${storage}/${encodedFilename}`,
        storage,
        method: "PUT" as const,
      },
      { path: `/api/v1/files/${storage}`, storage, method: "POST" as const },
      {
        path: `/api/files/${storage}/${encodedFilename}`,
        storage,
        method: "PUT" as const,
      },
      { path: `/api/files/${storage}`, storage, method: "POST" as const },
    ]);

    let resolvedStorageForStart = prusaStorageName;
    let uploadSucceeded = mode === "start_only";
    const uploadAttemptErrors: string[] = [];

    if (mode !== "start_only") {
      if (!fileBuffer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No file content provided for printer upload.",
        });
      }

      for (const candidate of uploadEndpointCandidates) {
        const headers: Record<string, string> = {
          "X-Api-Key": authToken,
        };

        let body: FormData | Blob;
        if (candidate.method === "POST") {
          const uploadForm = new FormData();
          uploadForm.append(
            "file",
            new Blob([fileBuffer], { type: "application/octet-stream" }),
            originalFilename,
          );
          body = uploadForm;
        } else {
          headers["Content-Type"] = "application/octet-stream";
          // Keep the previous upload shape that worked in the combined flow.
          headers["Print-After-Upload"] = "?1";
          headers.Overwrite = "?1";
          body = new Blob([fileBuffer], { type: "application/octet-stream" });
        }

        const uploadRes = await fetch(`http://${ipAddress}${candidate.path}`, {
          method: candidate.method,
          headers,
          body,
        });

        if (uploadRes.ok) {
          resolvedStorageForStart = candidate.storage;
          uploadSucceeded = true;
          break;
        }

        const errorBody = await uploadRes.text();
        uploadAttemptErrors.push(
          `${uploadRes.status} ${candidate.method} ${candidate.path}: ${sanitizeDbText(errorBody || "<empty>")}`,
        );

        const shouldContinueProbe =
          [404, 410].includes(uploadRes.status) ||
          // Some PrusaLink builds return 403 for unsupported storage aliases (e.g. /local) or methods.
          [403].includes(uploadRes.status) ||
          (candidate.method === "PUT" &&
            ([405, 408, 415, 422].includes(uploadRes.status) ||
              uploadRes.status >= 500));

        if (!shouldContinueProbe) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Prusa upload failed (${uploadRes.status}) [${candidate.method} ${candidate.path}]: ${sanitizeDbText(errorBody)}`,
          });
        }
      }

      if (!uploadSucceeded) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prusa upload failed: no compatible upload endpoint found. Tried ${uploadAttemptErrors.join(" | ")}`,
        });
      }
    }

    if (mode === "upload_only") {
      return {
        dispatched: true,
        details: `Uploaded file to Prusa printer storage (${resolvedStorageForStart}) without starting print.`,
      };
    }

    const filePathOnPrinter = `/${resolvedStorageForStart}/${originalFilename}`;
    const startPayload = JSON.stringify({
      command: "start",
      path: filePathOnPrinter,
    });
    let startSucceeded = false;
    const startErrors: string[] = [];
    const encodedStartFilename = encodeURIComponent(originalFilename);
    const startAttempts = [
      {
        method: "POST" as const,
        endpoint: `/api/v1/files/${resolvedStorageForStart}/${encodedStartFilename}`,
        headers: { "X-Api-Key": authToken },
        body: undefined,
      },
      {
        method: "POST" as const,
        endpoint: `/api/files/${resolvedStorageForStart}/${encodedStartFilename}`,
        headers: { "X-Api-Key": authToken },
        body: undefined,
      },
      {
        method: "POST" as const,
        endpoint: "/api/v1/job",
        headers: {
          "X-Api-Key": authToken,
          "Content-Type": "application/json",
        },
        body: startPayload,
      },
      {
        method: "POST" as const,
        endpoint: "/api/job",
        headers: {
          "X-Api-Key": authToken,
          "Content-Type": "application/json",
        },
        body: startPayload,
      },
    ];

    for (const attempt of startAttempts) {
      const startRes = await fetch(`http://${ipAddress}${attempt.endpoint}`, {
        method: attempt.method,
        headers: attempt.headers,
        body: attempt.body,
      });
      if (startRes.ok) {
        startSucceeded = true;
        break;
      }
      const errorBody = await startRes.text();
      startErrors.push(
        `${startRes.status} ${attempt.method} ${attempt.endpoint}: ${sanitizeDbText(errorBody || "<empty>")}`,
      );
      if (![404, 410].includes(startRes.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Prusa start failed (${startRes.status}) [${attempt.method} ${attempt.endpoint}]: ${sanitizeDbText(errorBody)}`,
        });
      }
    }
    if (!startSucceeded) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Prusa start failed: no compatible start endpoint found. Tried ${startErrors.join(" | ")}`,
      });
    }

    let postStartState = "UNKNOWN";
    try {
      for (let i = 0; i < 4; i++) {
        const statusJson = await getPrusaStatus();
        postStartState = statusJson.printer?.state?.trim() ?? "UNKNOWN";
        if (["PRINTING", "PAUSED"].includes(postStartState.toUpperCase())) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    } catch {
      // Non-fatal: upload+start already succeeded.
    }

    return {
      dispatched: true,
      details: `${mode === "start_only" ? "Start command sent to" : "Uploaded and start command sent to"} Prusa printer (state before=${initialPrinterState}, after=${postStartState}).`,
    };
  }

  if (mode !== "upload_and_start") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Separate upload/start flow is not supported for Bambu printers in this build.",
    });
  }

  const bambuBridgeUrl = process.env.BAMBU_BRIDGE_URL;
  if (!bambuBridgeUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Bambu dispatch requires BAMBU_BRIDGE_URL env var (bridge service endpoint).",
    });
  }

  const response = await fetch(bambuBridgeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ipAddress,
      serialNumber,
      fileName: originalFilename,
      fileContentBase64: fileBuffer.toString("base64"),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Bambu bridge dispatch failed (${response.status}): ${sanitizeDbText(errorBody)}`,
    });
  }

  return {
    dispatched: true,
    details: "File handed off to Bambu bridge service.",
  };
};

export const printRouter = router({
  getPrinters: userProcedure.query(async ({ ctx }) => {
    return ctx.prisma.printer.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  listMyPrintJobs: userProcedure.query(async ({ ctx }) => {
    return ctx.prisma.gcodePrintJob.findMany({
      where: { userId: ctx.user.id },
      include: { printer: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }),

  createPrinter: userProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: printerTypeSchema,
        ipAddress: ipAddressSchema,
        authToken: z.string().optional(),
        serialNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.prisma.printer.create({
          data: {
            name: input.name,
            type: input.type,
            ipAddress: input.ipAddress,
            authToken: input.authToken,
            serialNumber: input.serialNumber,
            createdByUserId: ctx.user.id,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A printer with this IP address already exists.",
          });
        }

        throw error;
      }
    }),

  uploadAndStore: userProcedure
    .input(
      z.object({
        printerIpAddress: ipAddressSchema,
        fileName: z.string().min(1),
        fileContentBase64: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const printer = await ctx.prisma.printer.findUnique({
        where: { ipAddress: input.printerIpAddress },
      });

      if (!printer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No configured printer found for that IP address.",
        });
      }

      const fileBuffer = Buffer.from(input.fileContentBase64, "base64");

      try {
        validateGcodePayload(input.fileName, fileBuffer);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Invalid G-code payload.",
        });
      }

      const sha256 = hashBufferSha256(fileBuffer);
      const safeName = sanitizeFilename(input.fileName);
      const storedName = `${Date.now()}_${sha256.slice(0, 12)}_${safeName}`;
      const storageRoot = join(process.cwd(), "uploads", "gcodes");
      await mkdir(storageRoot, { recursive: true });
      const storedPath = join(storageRoot, storedName);
      await writeFile(storedPath, fileBuffer);

      const printJob = await ctx.prisma.gcodePrintJob.create({
        data: {
          userId: ctx.user.id,
          printerId: printer.id,
          originalFilename: input.fileName,
          storedFilename: storedName,
          fileHashSha256: sha256,
          fileSizeBytes: fileBuffer.length,
          status: "STORED",
        },
      });

      try {
        const uploadResult = await dispatchToPrinter({
          printerType: printer.type,
          ipAddress: printer.ipAddress,
          fileBuffer,
          originalFilename: safeName,
          authToken: printer.authToken,
          serialNumber: printer.serialNumber,
          mode: "upload_only",
        });

        return await ctx.prisma.gcodePrintJob.update({
          where: { id: printJob.id },
          data: {
            status: "STORED",
            dispatchResponse: uploadResult.details,
            dispatchError: null,
          },
        });
      } catch (error) {
        const message = sanitizeDbText(
          error instanceof Error ? error.message : "Unknown upload error",
        );
        await ctx.prisma.gcodePrintJob.update({
          where: { id: printJob.id },
          data: {
            status: "DISPATCH_FAILED",
            dispatchError: message,
          },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Printer upload failed: ${message}`,
        });
      }
    }),

  startStoredPrint: userProcedure
    .input(
      z.object({
        printJobId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const printJob = await ctx.prisma.gcodePrintJob.findFirst({
        where: {
          id: input.printJobId,
          userId: ctx.user.id,
        },
        include: {
          printer: true,
        },
      });

      if (!printJob) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Print job not found.",
        });
      }

      const storedPath = join(process.cwd(), "uploads", "gcodes", printJob.storedFilename);

      let fileBuffer: Buffer;
      try {
        fileBuffer = await readFile(storedPath);
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            error instanceof Error
              ? `Stored file not found: ${error.message}`
              : "Stored file not found.",
        });
      }

      try {
        const dispatchResult = await dispatchToPrinter({
          printerType: printJob.printer.type,
          ipAddress: printJob.printer.ipAddress,
          fileBuffer,
          originalFilename: sanitizeFilename(printJob.originalFilename),
          authToken: printJob.printer.authToken,
          serialNumber: printJob.printer.serialNumber,
          mode: "start_only",
        });

        return await ctx.prisma.gcodePrintJob.update({
          where: { id: printJob.id },
          data: {
            status: "DISPATCHED",
            dispatchResponse: dispatchResult.details,
            dispatchError: null,
          },
        });
      } catch (error) {
        const message = sanitizeDbText(
          error instanceof Error ? error.message : "Unknown dispatch error",
        );
        await ctx.prisma.gcodePrintJob.update({
          where: { id: printJob.id },
          data: {
            status: "DISPATCH_FAILED",
            dispatchError: message,
          },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Dispatch failed: ${message}`,
        });
      }
    }),

  uploadAndPrint: userProcedure
    .input(
      z.object({
        printerIpAddress: ipAddressSchema,
        fileName: z.string().min(1),
        fileContentBase64: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const storedJob = await ctx.prisma.$transaction(async (tx) => {
        const printer = await tx.printer.findUnique({
          where: { ipAddress: input.printerIpAddress },
        });

        if (!printer) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No configured printer found for that IP address.",
          });
        }

        const fileBuffer = Buffer.from(input.fileContentBase64, "base64");

        try {
          validateGcodePayload(input.fileName, fileBuffer);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error ? error.message : "Invalid G-code payload.",
          });
        }

        const sha256 = hashBufferSha256(fileBuffer);
        const safeName = sanitizeFilename(input.fileName);
        const storedName = `${Date.now()}_${sha256.slice(0, 12)}_${safeName}`;
        const storageRoot = join(process.cwd(), "uploads", "gcodes");
        await mkdir(storageRoot, { recursive: true });
        await writeFile(join(storageRoot, storedName), fileBuffer);

        return tx.gcodePrintJob.create({
          data: {
            userId: ctx.user.id,
            printerId: printer.id,
            originalFilename: input.fileName,
            storedFilename: storedName,
            fileHashSha256: sha256,
            fileSizeBytes: fileBuffer.length,
            status: "STORED",
          },
        });
      });

      try {
        const reloaded = await ctx.prisma.gcodePrintJob.findUnique({
          where: { id: storedJob.id },
          include: { printer: true },
        });

        if (!reloaded) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Stored print job not found after upload.",
          });
        }

        const fileBuffer = await readFile(
          join(process.cwd(), "uploads", "gcodes", reloaded.storedFilename),
        );

        const dispatchResult = await dispatchToPrinter({
          printerType: reloaded.printer.type,
          ipAddress: reloaded.printer.ipAddress,
          fileBuffer,
          originalFilename: sanitizeFilename(reloaded.originalFilename),
          authToken: reloaded.printer.authToken,
          serialNumber: reloaded.printer.serialNumber,
        });

        return await ctx.prisma.gcodePrintJob.update({
          where: { id: reloaded.id },
          data: {
            status: "DISPATCHED",
            dispatchResponse: dispatchResult.details,
          },
        });
      } catch (error) {
        const message = sanitizeDbText(
          error instanceof Error ? error.message : "Unknown dispatch error",
        );
        await ctx.prisma.gcodePrintJob.update({
          where: { id: storedJob.id },
          data: {
            status: "DISPATCH_FAILED",
            dispatchError: message,
          },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Dispatch failed: ${message}`,
        });
      }
    }),
});
