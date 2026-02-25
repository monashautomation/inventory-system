import { config } from "dotenv";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { HTTPException } from "hono/http-exception";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

config();

type BambuDispatchRequest = {
  ipAddress?: string;
  serialNumber?: string | null;
  fileName?: string;
  fileContentBase64?: string;
};

const app = new Hono();
app.use(logger());

const sanitizeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "bambu-bridge",
    mode: process.env.BAMBU_BRIDGE_MOCK_SUCCESS === "1" ? "mock-success" : "stub",
  }),
);

app.get("/bambu/dispatch", (c) =>
  c.json(
    {
      error: "Use POST /bambu/dispatch",
      note: "This endpoint accepts JSON and is intended for the inventory app server.",
    },
    405,
  ),
);

app.post("/bambu/dispatch", async (c) => {
  let body: BambuDispatchRequest;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body." });
  }

  const ipAddress = body.ipAddress?.trim();
  const fileName = body.fileName?.trim();
  const fileContentBase64 = body.fileContentBase64?.trim();
  const serialNumber = body.serialNumber?.trim() ?? null;

  if (!ipAddress) {
    throw new HTTPException(400, { message: "Missing ipAddress." });
  }
  if (!fileName) {
    throw new HTTPException(400, { message: "Missing fileName." });
  }
  if (!fileContentBase64) {
    throw new HTTPException(400, { message: "Missing fileContentBase64." });
  }
  if (!fileName.toLowerCase().endsWith(".3mf")) {
    throw new HTTPException(400, {
      message: "Bambu bridge currently expects a .3mf file.",
    });
  }

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(fileContentBase64, "base64");
  } catch {
    throw new HTTPException(400, { message: "Invalid base64 file content." });
  }

  if (fileBuffer.length === 0) {
    throw new HTTPException(400, { message: "Uploaded file is empty." });
  }

  // Archive requests locally so you can validate app->bridge handoff before wiring
  // actual Bambu transport (MQTT/FTP/etc).
  const inboxDir = join(process.cwd(), "uploads", "bambu-bridge-inbox");
  await mkdir(inboxDir, { recursive: true });
  const storedName = `${Date.now()}_${sanitizeFilename(fileName)}`;
  await writeFile(join(inboxDir, storedName), fileBuffer);

  if (process.env.BAMBU_BRIDGE_MOCK_SUCCESS === "1") {
    return c.json({
      ok: true,
      mode: "mock-success",
      details:
        "File accepted by local Bambu bridge stub and archived locally. Printer dispatch is not implemented yet.",
      storedFilename: storedName,
      ipAddress,
      serialNumber,
    });
  }

  return c.json(
    {
      ok: false,
      mode: "stub",
      error:
        "Bambu bridge received and archived the file, but real Bambu printer dispatch is not implemented in this bridge yet.",
      storedFilename: storedName,
      ipAddress,
      serialNumber,
    },
    501,
  );
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unexpected Bambu bridge error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = Number(process.env.BAMBU_BRIDGE_PORT ?? 8081);

console.log(`Bambu bridge listening on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
