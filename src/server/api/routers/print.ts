import { router, userProcedure, adminProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { tmpdir } from "node:os";
import { writeFile as writeTmpFile, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  hashBufferSha256,
  sanitizeFilename,
  validateGcodePayload,
} from "@/server/api/utils/print/print.utils";
import {
  uploadFile,
  downloadFile,
  presignDownload,
  buildPrintJobS3Key,
} from "@/server/lib/s3";

const printerTypeSchema = z.enum(["PRUSA", "BAMBU"]);
const ipAddressSchema = z.string().refine((value) => isIP(value) !== 0, {
  message: "Invalid IP address",
});

const sanitizeDbText = (value: string, maxLength = 4000) =>
  value.replace(/\u0000/g, "").slice(0, maxLength);

const MAX_BAMBU_PRINT_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

const validateUploadPayloadForPrinter = (
  printerType: "PRUSA" | "BAMBU",
  fileName: string,
  fileBuffer: Buffer,
) => {
  if (printerType === "PRUSA") {
    validateGcodePayload(fileName, fileBuffer);
    return;
  }

  if (!fileName.trim()) {
    throw new Error("File name is required.");
  }

  const lower = fileName.toLowerCase();
  if (!lower.endsWith(".3mf")) {
    throw new Error("Bambu printers currently support .3mf uploads only.");
  }

  if (fileBuffer.length === 0) {
    throw new Error(".3mf file cannot be empty.");
  }

  if (fileBuffer.length > MAX_BAMBU_PRINT_FILE_SIZE_BYTES) {
    throw new Error(".3mf file is too large. Max size is 1GB.");
  }
};

// ─── Bambu external command dispatch (inlined from bambuBridge.ts) ────────────

const readJsonArrayEnv = (name: string): string[] => {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) {
    throw new Error(`${name} must be a JSON string array.`);
  }
  return parsed;
};

const runBambuExternalDispatch = async (params: {
  ipAddress: string;
  serialNumber: string | null;
  authToken: string;
  fileName: string;
  fileBuffer: Buffer;
}): Promise<{
  ok: boolean;
  mode: "mock-success" | "external-command" | "no-adapter";
  details: string;
}> => {
  // Mock mode for development/testing
  if (process.env.BAMBU_BRIDGE_MOCK_SUCCESS === "1") {
    return {
      ok: true,
      mode: "mock-success",
      details:
        "File accepted (mock mode). Printer dispatch is not implemented yet.",
    };
  }

  const cmd = process.env.BAMBU_BRIDGE_DISPATCH_CMD?.trim();
  if (!cmd) {
    return {
      ok: false,
      mode: "no-adapter",
      details:
        "No Bambu dispatch adapter configured. Set BAMBU_BRIDGE_DISPATCH_CMD or use BAMBU_BRIDGE_MOCK_SUCCESS=1.",
    };
  }

  // Write file to a temp location for the external command
  const tmpPath = join(
    tmpdir(),
    `bambu_dispatch_${Date.now()}_${sanitizeFilename(params.fileName)}`,
  );
  await writeTmpFile(tmpPath, params.fileBuffer);

  try {
    const args = readJsonArrayEnv("BAMBU_BRIDGE_DISPATCH_ARGS_JSON");
    const timeoutMs = Number(
      process.env.BAMBU_BRIDGE_DISPATCH_TIMEOUT_MS ?? 120000,
    );

    const result = await new Promise<{
      ok: boolean;
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          BAMBU_IP_ADDRESS: params.ipAddress,
          BAMBU_SERIAL_NUMBER: params.serialNumber ?? "",
          BAMBU_ACCESS_CODE: params.authToken,
          BAMBU_FILE_NAME: params.fileName,
          BAMBU_FILE_PATH: tmpPath,
        },
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let killedForTimeout = false;

      const timer = setTimeout(() => {
        killedForTimeout = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (killedForTimeout) {
          resolve({
            ok: false,
            exitCode: code,
            stdout,
            stderr: `${stderr}\nTimed out after ${timeoutMs}ms.`.trim(),
          });
          return;
        }
        resolve({
          ok: code === 0,
          exitCode: code,
          stdout,
          stderr,
        });
      });
    });

    if (result.ok) {
      return {
        ok: true,
        mode: "external-command",
        details: `File dispatched via external command. ${result.stdout.trim().slice(0, 500)}`,
      };
    }

    return {
      ok: false,
      mode: "external-command",
      details: `External dispatch command failed (exit ${result.exitCode}): ${result.stderr.trim().slice(0, 500)}`,
    };
  } finally {
    // Clean up temp file
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
};

// ─── Printer dispatch ────────────────────────────────────────────────────────

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

    interface PrusaStatusResponse {
      storage?: { name?: string; read_only?: boolean };
      printer?: { state?: string };
    }
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

        let body: FormData | Buffer;
        if (candidate.method === "POST") {
          const uploadForm = new FormData();
          uploadForm.append(
            "file",
            new Blob([fileBuffer], { type: "application/octet-stream" }),
            originalFilename,
          );
          body = uploadForm;
        } else {
          headers.Accept = "application/json";
          headers["Content-Type"] = /\.(gcode|gco)$/i.test(originalFilename)
            ? "text/x.gcode"
            : "application/octet-stream";
          headers["Content-Length"] = String(fileBuffer.length);
          // Keep the previous upload shape that worked in the combined flow.
          if (mode === "upload_and_start") {
            headers["Print-After-Upload"] = "1";
          }
          headers.Overwrite = "1";
          body = fileBuffer;
        }

        let uploadRes: Response;
        try {
          uploadRes = await fetch(`http://${ipAddress}${candidate.path}`, {
            method: candidate.method,
            headers,
            body,
          });
        } catch (error) {
          const networkMessage = sanitizeDbText(
            error instanceof Error ? error.message : "Network upload error",
          );
          uploadAttemptErrors.push(
            `NETWORK ${candidate.method} ${candidate.path}: ${networkMessage}`,
          );
          // Some PrusaLink builds drop the socket on unsupported methods. Keep probing.
          continue;
        }

        if (uploadRes.ok || uploadRes.status === 409) {
          // 409 = file already exists on printer storage — treat as success
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

  // ─── Bambu dispatch (inlined, no separate bridge service) ──────────────────

  if (mode !== "upload_and_start") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Separate upload/start flow is not supported for Bambu printers in this build.",
    });
  }

  if (!fileBuffer) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No file content provided for Bambu dispatch.",
    });
  }

  if (!authToken) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing authToken (Bambu access code).",
    });
  }

  const bambuResult = await runBambuExternalDispatch({
    ipAddress,
    serialNumber: serialNumber ?? null,
    authToken,
    fileName: originalFilename,
    fileBuffer,
  });

  if (!bambuResult.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Bambu dispatch failed (${bambuResult.mode}): ${bambuResult.details}`,
    });
  }

  return {
    dispatched: true,
    details: bambuResult.details,
  };
};

// ─── Router ──────────────────────────────────────────────────────────────────

export const printRouter = router({
  getPrinters: userProcedure.query(async ({ ctx }) => {
    return ctx.prisma.printer.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  getPrinterStatus: userProcedure
    .input(
      z.object({
        printerIpAddress: ipAddressSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const printer = await ctx.prisma.printer.findUnique({
        where: { ipAddress: input.printerIpAddress },
      });

      if (!printer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Printer not found.",
        });
      }

      if (printer.type === "BAMBU") {
        return {
          state: "UNKNOWN",
          stateMessage: "Bambu printers do not expose an HTTP status API.",
        };
      }

      if (!printer.authToken) {
        return {
          state: "UNKNOWN",
          stateMessage: "No auth token configured for this printer.",
        };
      }

      try {
        const res = await fetch(
          `http://${printer.ipAddress}/api/v1/status`,
          {
            headers: { "X-Api-Key": printer.authToken },
            signal: AbortSignal.timeout(5000),
          },
        );

        if (!res.ok) {
          return {
            state: "UNREACHABLE",
            stateMessage: `Status check failed (HTTP ${res.status}).`,
          };
        }

        const json = (await res.json()) as {
          printer?: { state?: string };
          job?: { id?: number; progress?: number };
        };

        const state = json.printer?.state?.trim() ?? "UNKNOWN";
        const progress = json.job?.progress;
        const progressText =
          progress != null ? ` (${Math.round(progress)}%)` : "";

        return {
          state,
          stateMessage:
            state === "PRINTING"
              ? `Printing in progress${progressText}`
              : state === "IDLE" || state === "READY" || state === "FINISHED"
                ? "Ready"
                : state,
        };
      } catch {
        return {
          state: "UNREACHABLE",
          stateMessage: "Could not reach printer.",
        };
      }
    }),

  getPrinterMonitoringOptions: userProcedure.query(async ({ ctx }) => {
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

  getDownloadUrl: userProcedure
    .input(
      z.object({
        printJobId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const printJob = await ctx.prisma.gcodePrintJob.findFirst({
        where: {
          id: input.printJobId,
          userId: ctx.user.id,
        },
      });

      if (!printJob) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Print job not found.",
        });
      }

      if (!printJob.s3Key) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "This print job was created before S3 storage was enabled. File is not available for download.",
        });
      }

      const url = presignDownload(printJob.s3Key, 3600);

      return {
        url,
        filename: printJob.originalFilename,
        expiresInSeconds: 3600,
      };
    }),

  createPrinter: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: printerTypeSchema,
        ipAddress: ipAddressSchema,
        authToken: z.string().optional(),
        serialNumber: z.string().optional(),
        webcamUrl: z.string().url().optional(),
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
            webcamUrl: input.webcamUrl,
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

  deletePrinter: adminProcedure
    .input(
      z.object({
        printerId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const printer = await ctx.prisma.printer.findUnique({
        where: { id: input.printerId },
        select: { id: true, _count: { select: { printJobs: true } } },
      });

      if (!printer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Printer not found.",
        });
      }

      if (printer._count.printJobs > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete printer: it has ${printer._count.printJobs} associated print job(s). Remove them first.`,
        });
      }

      await ctx.prisma.printer.delete({
        where: { id: input.printerId },
      });

      return { deleted: true };
    }),

  updatePrinter: adminProcedure
    .input(
      z.object({
        printerId: z.string().uuid(),
        name: z.string().min(1).optional(),
        type: printerTypeSchema.optional(),
        ipAddress: ipAddressSchema.optional(),
        authToken: z.string().nullable().optional(),
        serialNumber: z.string().nullable().optional(),
        webcamUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { printerId, ...data } = input;

      const existing = await ctx.prisma.printer.findUnique({
        where: { id: printerId },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Printer not found.",
        });
      }

      try {
        return await ctx.prisma.printer.update({
          where: { id: printerId },
          data,
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
        validateUploadPayloadForPrinter(
          printer.type,
          input.fileName,
          fileBuffer,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid print file payload.",
        });
      }

      const sha256 = hashBufferSha256(fileBuffer);
      const safeName = sanitizeFilename(input.fileName);
      const timestamp = Date.now();
      const storedName = `${timestamp}_${sha256.slice(0, 12)}_${safeName}`;
      const s3Key = buildPrintJobS3Key(
        ctx.user.id,
        timestamp,
        sha256.slice(0, 12),
        safeName,
      );

      // Upload to S3
      await uploadFile(s3Key, fileBuffer);

      const printJob = await ctx.prisma.gcodePrintJob.create({
        data: {
          userId: ctx.user.id,
          printerId: printer.id,
          originalFilename: input.fileName,
          storedFilename: storedName,
          s3Key,
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

      // Download file from S3 (fall back to legacy local path for old jobs)
      let fileBuffer: Buffer;
      if (printJob.s3Key) {
        try {
          const bytes = await downloadFile(printJob.s3Key);
          fileBuffer = Buffer.from(bytes);
        } catch (error) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              error instanceof Error
                ? `S3 file not found: ${error.message}`
                : "S3 file not found.",
          });
        }
      } else {
        // Legacy fallback: try local filesystem for pre-S3 jobs
        const storedPath = join(
          process.cwd(),
          "uploads",
          "gcodes",
          printJob.storedFilename,
        );
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
        validateUploadPayloadForPrinter(
          printer.type,
          input.fileName,
          fileBuffer,
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid print file payload.",
        });
      }

      const sha256 = hashBufferSha256(fileBuffer);
      const safeName = sanitizeFilename(input.fileName);

      // Check if a file with the same hash already exists for this printer
      const existingJob = await ctx.prisma.gcodePrintJob.findFirst({
        where: {
          fileHashSha256: sha256,
          printerId: printer.id,
          s3Key: { not: null },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingJob) {
        // File already stored — just dispatch it
        const newJob = await ctx.prisma.gcodePrintJob.create({
          data: {
            userId: ctx.user.id,
            printerId: printer.id,
            originalFilename: input.fileName,
            storedFilename: existingJob.storedFilename,
            s3Key: existingJob.s3Key,
            fileHashSha256: sha256,
            fileSizeBytes: fileBuffer.length,
            status: "STORED",
          },
        });

        try {
          const dispatchResult = await dispatchToPrinter({
            printerType: printer.type,
            ipAddress: printer.ipAddress,
            fileBuffer,
            originalFilename: safeName,
            authToken: printer.authToken,
            serialNumber: printer.serialNumber,
          });

          return await ctx.prisma.gcodePrintJob.update({
            where: { id: newJob.id },
            data: {
              status: "DISPATCHED",
              dispatchResponse: `Re-used existing file. ${dispatchResult.details ?? ""}`.trim(),
            },
          });
        } catch (error) {
          const message = sanitizeDbText(
            error instanceof Error ? error.message : "Unknown dispatch error",
          );
          await ctx.prisma.gcodePrintJob.update({
            where: { id: newJob.id },
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
      }

      // New file — upload to S3 then dispatch
      const timestamp = Date.now();
      const storedName = `${timestamp}_${sha256.slice(0, 12)}_${safeName}`;
      const s3Key = buildPrintJobS3Key(
        ctx.user.id,
        timestamp,
        sha256.slice(0, 12),
        safeName,
      );

      await uploadFile(s3Key, fileBuffer);

      const storedJob = await ctx.prisma.gcodePrintJob.create({
        data: {
          userId: ctx.user.id,
          printerId: printer.id,
          originalFilename: input.fileName,
          storedFilename: storedName,
          s3Key,
          fileHashSha256: sha256,
          fileSizeBytes: fileBuffer.length,
          status: "STORED",
        },
      });

      try {
        const dispatchResult = await dispatchToPrinter({
          printerType: printer.type,
          ipAddress: printer.ipAddress,
          fileBuffer,
          originalFilename: safeName,
          authToken: printer.authToken,
          serialNumber: printer.serialNumber,
        });

        return await ctx.prisma.gcodePrintJob.update({
          where: { id: storedJob.id },
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
