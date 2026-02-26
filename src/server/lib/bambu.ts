import mqtt from "mqtt";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { execFile } from "node:child_process";

// ─── Constants ────────────────────────────────────────────────────────────────

const BAMBU_FTP_USER = "bblp";
const BAMBU_FTP_PORT = 990;
const BAMBU_MQTT_PORT = 8883;
const BAMBU_MQTT_USER = "bblp";
const BAMBU_CACHE_DIR = "cache";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BambuDispatchParams {
  ipAddress: string;
  accessCode: string;
  serialNumber: string;
  fileName: string;
  fileBuffer: Buffer;
  plateNumber?: number;
  useLeveling?: boolean;
}

export interface BambuDispatchResult {
  ok: boolean;
  details: string;
}

// ─── Step 1: Upload via curl + implicit FTPS (port 990) ──────────────────────
//
// Bun's TLS stream pipeline doesn't send close_notify properly with basic-ftp,
// so the printer never acknowledges the upload. curl handles implicit FTPS
// natively and works reliably.

async function uploadViaFtps(
  ipAddress: string,
  accessCode: string,
  fileName: string,
  fileBuffer: Buffer,
): Promise<string> {
  const tmpPath = join(tmpdir(), `bambu_upload_${Date.now()}_${fileName}`);
  await writeFile(tmpPath, fileBuffer);

  const remotePath = `${BAMBU_CACHE_DIR}/${fileName}`;
  const ftpsUrl = `ftps://${BAMBU_FTP_USER}:${accessCode}@${ipAddress}:${BAMBU_FTP_PORT}/${remotePath}`;

  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        "curl",
        [
          "-k", // accept self-signed cert
          "--ssl-reqd", // require TLS
          "-T",
          tmpPath, // upload file
          ftpsUrl,
          "--connect-timeout",
          "10",
          "--max-time",
          "120",
          "-s", // silent
          "-S", // show errors
        ],
        { timeout: 130_000 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(
              new Error(
                `FTPS upload failed: ${stderr?.trim() || error.message}`,
              ),
            );
          } else {
            resolve();
          }
        },
      );
    });

    return remotePath;
  } finally {
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

// ─── Step 2: Send print command via MQTT (port 8883) ──────────────────────────

function buildPrintPayload(
  remotePath: string,
  plateNumber: number,
  useLeveling: boolean,
): string {
  return JSON.stringify({
    print: {
      sequence_id: "0",
      command: "project_file",
      param: `Metadata/plate_${plateNumber}.gcode`,
      project_id: "0",
      profile_id: "0",
      task_id: "0",
      subtask_id: "0",
      subtask_name: remotePath,
      url: `file:///sdcard/${remotePath}`,
      timelapse: false,
      bed_type: "auto",
      bed_levelling: useLeveling,
      flow_cali: false,
      vibration_cali: false,
      layer_inspect: false,
      ams_mapping: [],
      use_ams: false,
      job_type: 1,
    },
  });
}

async function sendPrintCommand(
  ipAddress: string,
  accessCode: string,
  serialNumber: string,
  remotePath: string,
  plateNumber: number,
  useLeveling: boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestTopic = `device/${serialNumber}/request`;
    const clientId = `inventory-${serialNumber}-${Date.now()}`;

    const client = mqtt.connect(`mqtts://${ipAddress}:${BAMBU_MQTT_PORT}`, {
      username: BAMBU_MQTT_USER,
      password: accessCode,
      clientId,
      rejectUnauthorized: false,
      protocol: "mqtts",
      connectTimeout: 10_000,
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT connection timed out after 10s."));
    }, 15_000);

    client.on("connect", () => {
      const payload = buildPrintPayload(remotePath, plateNumber, useLeveling);

      client.publish(requestTopic, payload, { qos: 0 }, (err) => {
        clearTimeout(timeout);
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      client.end(true);
      reject(err);
    });
  });
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function dispatchToBambu(
  params: BambuDispatchParams,
): Promise<BambuDispatchResult> {
  const {
    ipAddress,
    accessCode,
    serialNumber,
    fileName,
    fileBuffer,
    plateNumber = 1,
    useLeveling = true,
  } = params;

  if (!serialNumber) {
    return {
      ok: false,
      details:
        "Bambu printer requires a serial number for MQTT dispatch. Configure it in Printer Management.",
    };
  }

  // Mock mode for development/testing
  if (process.env.BAMBU_BRIDGE_MOCK_SUCCESS === "1") {
    return {
      ok: true,
      details:
        "File accepted (mock mode). Printer dispatch is not implemented yet.",
    };
  }

  try {
    const remotePath = await uploadViaFtps(
      ipAddress,
      accessCode,
      fileName,
      fileBuffer,
    );

    await sendPrintCommand(
      ipAddress,
      accessCode,
      serialNumber,
      remotePath,
      plateNumber,
      useLeveling,
    );

    return {
      ok: true,
      details: `File uploaded via FTPS and print started via MQTT (${remotePath}).`,
    };
  } catch (error) {
    return {
      ok: false,
      details:
        error instanceof Error
          ? error.message
          : "Unknown Bambu dispatch error.",
    };
  }
}

// ─── Status Monitoring via MQTT ──────────────────────────────────────────────

export interface BambuCachedStatus {
  gcodeState: string;
  nozzleTemp: number | null;
  targetNozzleTemp: number | null;
  bedTemp: number | null;
  targetBedTemp: number | null;
  chamberTemp: number | null;
  progress: number | null;
  remainingTimeMinutes: number | null;
  fileName: string | null;
  layerNum: number | null;
  totalLayerNum: number | null;
  lastUpdated: number;
}

interface BambuMonitorEntry {
  client: mqtt.MqttClient;
  serialNumber: string;
  status: BambuCachedStatus;
  idleTimeout: ReturnType<typeof setTimeout>;
  connecting: boolean;
}

const BAMBU_MONITOR_IDLE_MS = 300_000; // 5 minutes

const monitorCache = new Map<string, BambuMonitorEntry>();

function createEmptyStatus(): BambuCachedStatus {
  return {
    gcodeState: "UNKNOWN",
    nozzleTemp: null,
    targetNozzleTemp: null,
    bedTemp: null,
    targetBedTemp: null,
    chamberTemp: null,
    progress: null,
    remainingTimeMinutes: null,
    fileName: null,
    layerNum: null,
    totalLayerNum: null,
    lastUpdated: 0,
  };
}

function mergeReportIntoStatus(
  status: BambuCachedStatus,
  report: Record<string, unknown>,
): void {
  if (typeof report.gcode_state === "string") {
    status.gcodeState = report.gcode_state;
  }
  if (typeof report.nozzle_temper === "number") {
    status.nozzleTemp = report.nozzle_temper;
  }
  if (typeof report.nozzle_target_temper === "number") {
    status.targetNozzleTemp = report.nozzle_target_temper;
  }
  if (typeof report.bed_temper === "number") {
    status.bedTemp = report.bed_temper;
  }
  if (typeof report.bed_target_temper === "number") {
    status.targetBedTemp = report.bed_target_temper;
  }
  if (typeof report.chamber_temper === "number") {
    status.chamberTemp = report.chamber_temper;
  }
  if (typeof report.mc_percent === "number") {
    status.progress = report.mc_percent;
  }
  if (typeof report.mc_remaining_time === "number") {
    status.remainingTimeMinutes = report.mc_remaining_time;
  }
  if (typeof report.subtask_name === "string") {
    status.fileName = report.subtask_name || null;
  }
  if (typeof report.layer_num === "number") {
    status.layerNum = report.layer_num;
  }
  if (typeof report.total_layer_num === "number") {
    status.totalLayerNum = report.total_layer_num;
  }
  status.lastUpdated = Date.now();
}

function cleanupMonitor(serialNumber: string): void {
  const entry = monitorCache.get(serialNumber);
  if (!entry) return;
  clearTimeout(entry.idleTimeout);
  try {
    entry.client.end(true);
  } catch {
    // Ignore cleanup errors
  }
  monitorCache.delete(serialNumber);
}

function resetIdleTimeout(serialNumber: string): void {
  const entry = monitorCache.get(serialNumber);
  if (!entry) return;
  clearTimeout(entry.idleTimeout);
  entry.idleTimeout = setTimeout(() => {
    cleanupMonitor(serialNumber);
  }, BAMBU_MONITOR_IDLE_MS);
}

function connectBambuMonitor(
  ipAddress: string,
  accessCode: string,
  serialNumber: string,
): void {
  if (monitorCache.has(serialNumber)) return;

  const reportTopic = `device/${serialNumber}/report`;
  const requestTopic = `device/${serialNumber}/request`;
  const clientId = `inventory-monitor-${serialNumber}-${Date.now()}`;

  const status = createEmptyStatus();

  const client = mqtt.connect(`mqtts://${ipAddress}:${BAMBU_MQTT_PORT}`, {
    username: BAMBU_MQTT_USER,
    password: accessCode,
    clientId,
    rejectUnauthorized: false,
    protocol: "mqtts",
    connectTimeout: 10_000,
    reconnectPeriod: 5_000,
  });

  const idleTimeout = setTimeout(() => {
    cleanupMonitor(serialNumber);
  }, BAMBU_MONITOR_IDLE_MS);

  const entry: BambuMonitorEntry = {
    client,
    serialNumber,
    status,
    idleTimeout,
    connecting: true,
  };

  monitorCache.set(serialNumber, entry);

  client.on("connect", () => {
    entry.connecting = false;

    client.subscribe(reportTopic, { qos: 0 }, (err) => {
      if (err) return;

      // Request full status dump
      const pushallPayload = JSON.stringify({
        pushing: { sequence_id: "0", command: "pushall" },
      });
      client.publish(requestTopic, pushallPayload, { qos: 0 });
    });
  });

  client.on("message", (_topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString()) as Record<string, unknown>;
      const print = msg.print as Record<string, unknown> | undefined;
      if (print && typeof print === "object") {
        mergeReportIntoStatus(entry.status, print);
      }
    } catch {
      // Ignore malformed messages
    }
  });

  client.on("error", () => {
    cleanupMonitor(serialNumber);
  });

  client.on("close", () => {
    monitorCache.delete(serialNumber);
  });
}

export function getBambuStatus(
  ipAddress: string,
  accessCode: string,
  serialNumber: string,
): BambuCachedStatus | null {
  const existing = monitorCache.get(serialNumber);

  if (!existing) {
    connectBambuMonitor(ipAddress, accessCode, serialNumber);
    return null;
  }

  resetIdleTimeout(serialNumber);

  if (existing.connecting || existing.status.lastUpdated === 0) {
    return null;
  }

  return existing.status;
}
