import "dotenv/config";
import { PrismaClient, type PrinterType } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface PrinterSeedInput {
  name: string;
  type: PrinterType;
  ipAddress: string;
  authToken?: string;
  serialNumber?: string;
  webcamUrl?: string;
}

const prisma = new PrismaClient();

const printerConfigCandidates = [
  join(process.cwd(), "config", "printers.local.json"),
  join(process.cwd(), "config", "printers.json"),
];

async function readPrinterConfigJson(): Promise<string | null> {
  for (const path of printerConfigCandidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

function normalizePrinter(item: unknown, index: number): PrinterSeedInput {
  if (!item || typeof item !== "object") {
    throw new Error(`Printer entry at index ${index} must be an object.`);
  }

  const value = item as Record<string, unknown>;
  const type = String(value.type ?? "").toUpperCase();
  if (type !== "PRUSA" && type !== "BAMBU") {
    throw new Error(`Printer entry ${index} has invalid type: ${String(value.type)}`);
  }

  const printer: PrinterSeedInput = {
    name: String(value.name ?? "").trim(),
    type: type as PrinterType,
    ipAddress: String(value.ipAddress ?? "").trim(),
    authToken: value.authToken == null ? undefined : String(value.authToken).trim(),
    serialNumber:
      value.serialNumber == null ? undefined : String(value.serialNumber).trim(),
    webcamUrl:
      value.webcamUrl == null ? undefined : String(value.webcamUrl).trim(),
  };

  if (!printer.name || !printer.ipAddress) {
    throw new Error(`Printer entry ${index} is missing name/ipAddress.`);
  }

  if (printer.type === "PRUSA" && !printer.authToken) {
    throw new Error(`PRUSA printer entry ${index} is missing authToken.`);
  }

  return printer;
}

async function parsePrinters(): Promise<PrinterSeedInput[]> {
  const raw =
    (await readPrinterConfigJson()) ?? process.env.PRINTER_PROFILES_JSON?.trim() ?? "";
  if (!raw) return [];

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Printer config must be a JSON array.");
  }

  return parsed.map(normalizePrinter);
}

async function resolveOwnerUserId() {
  const ownerUserId = process.env.PRINTER_OWNER_USER_ID?.trim();
  if (ownerUserId) {
    const user = await prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new Error(
        `No user found for PRINTER_OWNER_USER_ID=${ownerUserId}. Use a real user.id UUID from the database, or set PRINTER_OWNER_EMAIL instead.`,
      );
    }

    return user.id;
  }

  const ownerEmail = process.env.PRINTER_OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    throw new Error(
      "Set PRINTER_OWNER_USER_ID or PRINTER_OWNER_EMAIL in .env before running seedPrinters.",
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: ownerEmail },
    select: { id: true, email: true },
  });

  if (!user) {
    throw new Error(`No user found for PRINTER_OWNER_EMAIL=${ownerEmail}`);
  }

  return user.id;
}

async function main() {
  const ownerUserId = await resolveOwnerUserId();
  const printers = await parsePrinters();

  if (printers.length === 0) {
    console.log(
      "No printer profiles provided. Create config/printers.local.json (or config/printers.json) with a JSON array of printers.",
    );
    return;
  }

  for (const printer of printers) {
    const result = await prisma.printer.upsert({
      where: { ipAddress: printer.ipAddress },
      update: {
        name: printer.name,
        type: printer.type,
        authToken: printer.authToken ?? null,
        serialNumber: printer.serialNumber ?? null,
        webcamUrl: printer.webcamUrl ?? null,
      },
      create: {
        name: printer.name,
        type: printer.type,
        ipAddress: printer.ipAddress,
        authToken: printer.authToken ?? null,
        serialNumber: printer.serialNumber ?? null,
        webcamUrl: printer.webcamUrl ?? null,
        createdByUserId: ownerUserId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        ipAddress: true,
      },
    });

    console.log(`Upserted printer ${result.name} (${result.type}) @ ${result.ipAddress}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
