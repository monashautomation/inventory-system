import mqtt from "mqtt";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { isIP } from "node:net";

// ─── Constants ────────────────────────────────────────────────────────────────

const BAMBU_FTP_USER = "bblp";
const BAMBU_FTP_PORT = 990;
const BAMBU_MQTT_PORT = 8883;
const BAMBU_MQTT_USER = "bblp";
const BAMBU_CACHE_DIR = "cache";
let resolvedCurlPath: string | null = null;

async function resolveCurlPath(): Promise<string> {
  if (resolvedCurlPath) return resolvedCurlPath;

  return new Promise((resolve, reject) => {
    execFile("/usr/bin/which", ["curl"], (error, stdout) => {
      const curlPath = stdout?.trim();
      if (error || !curlPath) {
        reject(
          new Error(
            "curl is not installed or not found in PATH. curl is required for Bambu printer FTPS uploads. Install it with: apt-get install curl (Debian/Ubuntu) or brew install curl (macOS).",
          ),
        );
        return;
      }
      resolvedCurlPath = curlPath;
      resolve(curlPath);
    });
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BambuDispatchParams {
  ipAddress: string;
  accessCode: string;
  serialNumber: string;
  fileName: string;
  fileBuffer: Buffer;
  plateNumber?: number;
  useLeveling?: boolean;
  useAms?: boolean;
  amsMapping?: number[];
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
  const ftpsUrl = `ftps://${ipAddress}:${BAMBU_FTP_PORT}/${remotePath}`;
  const curlConfig = `user = "${BAMBU_FTP_USER}:${accessCode}"\n`;

  const curlPath = await resolveCurlPath();

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        curlPath,
        [
          "-k", // accept self-signed cert
          "--ssl-reqd", // require TLS
          "-T",
          tmpPath, // upload file
          "--connect-timeout",
          "10",
          "--max-time",
          "120",
          "-s", // silent
          "-S", // show errors
          "--config",
          "-",
          "--",
          ftpsUrl,
        ],
        { stdio: ["pipe", "pipe", "pipe"], timeout: 130_000 },
      );

      proc.stdin.write(curlConfig);
      proc.stdin.end();

      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to start curl: ${err.message}`));
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `FTPS upload failed (exit ${code}): ${stderr.trim() || "unknown error"}`,
            ),
          );
        } else {
          resolve();
        }
      });
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
  useAms: boolean,
  amsMapping: number[],
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
      ams_mapping: amsMapping,
      use_ams: useAms,
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
  useAms: boolean,
  amsMapping: number[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestTopic = `device/${serialNumber}/request`;
    const clientId = `inventory-${serialNumber}-${Date.now()}`;

    const client = mqtt.connect(`mqtts://${ipAddress}:${BAMBU_MQTT_PORT}`, {
      username: BAMBU_MQTT_USER,
      password: accessCode,
      clientId,
      // SECURITY: Bambu printers use self-signed TLS certificates.
      // rejectUnauthorized must be false to connect. MitM risk is limited
      // to the local network where the printer resides.
      rejectUnauthorized: false,
      protocol: "mqtts",
      protocolVersion: 4, // MQTT 3.1.1 — Bambu printers don't support MQTT 5.0
      connectTimeout: 10_000,
    });

    const timeout = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT connection timed out after 10s."));
    }, 15_000);

    client.on("connect", () => {
      const payload = buildPrintPayload(
        remotePath,
        plateNumber,
        useLeveling,
        useAms,
        amsMapping,
      );

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

// Serial number: Bambu serial numbers are alphanumeric only (e.g. "01S00C000000001")
const SERIAL_NUMBER_RE = /^[A-Za-z0-9]{1,30}$/;

// Filename: only safe chars (should already be sanitized upstream, but defense-in-depth)
const SAFE_FILENAME_RE = /^[a-zA-Z0-9._-]{1,120}$/;

function validateBambuInputs(params: {
  ipAddress: string;
  accessCode: string;
  serialNumber?: string;
  fileName?: string;
}): void {
  // Validate IP
  if (isIP(params.ipAddress) === 0) {
    throw new Error("Invalid IP address for Bambu printer.");
  }

  // Validate access code is non-empty and doesn't contain control chars
  // eslint-disable-next-line no-control-regex
  if (!params.accessCode || /[\x00-\x1f]/.test(params.accessCode)) {
    throw new Error("Invalid or missing Bambu access code.");
  }

  // Validate serial number if provided (prevents MQTT topic injection with /, +, #)
  if (params.serialNumber !== undefined && params.serialNumber !== "") {
    if (!SERIAL_NUMBER_RE.test(params.serialNumber)) {
      throw new Error(
        "Invalid Bambu serial number. Expected alphanumeric characters only (e.g. '01S00C000000001').",
      );
    }
  }

  // Validate fileName if provided (defense-in-depth, should be sanitized upstream)
  if (params.fileName !== undefined) {
    if (!params.fileName || !SAFE_FILENAME_RE.test(params.fileName)) {
      throw new Error(
        "Invalid file name for Bambu upload. Only alphanumeric, dots, hyphens, and underscores are allowed.",
      );
    }
  }
}

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
    useAms = true,
    amsMapping = [0],
  } = params;
  validateBambuInputs({ ipAddress, accessCode, serialNumber, fileName });

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
      useAms,
      amsMapping,
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

export interface AmsTrayInfo {
  /** Global tray ID: (ams_unit * 4) + slot. 254 = external spool. */
  trayId: number;
  /** Base material type: "PLA", "ABS", "PETG", etc. Empty string if unknown. */
  trayType: string;
  /** Specific variant name: "PLA Matte", "PETG-CF", etc. Empty string if generic/third-party. */
  traySubBrands: string;
  /** Primary color as RRGGBBAA hex string (e.g. "FF0000FF"). Empty if unknown. */
  trayColor: string;
  /** Filament profile code (e.g. "GFA00"). Empty if unknown. */
  trayInfoIdx: string;
  /** Filament remaining 0–100%. -1 if unknown/unsupported. */
  remain: number;
  /** Whether this tray slot is empty (no spool loaded). */
  isEmpty: boolean;
}

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
  filamentType: string | null;
  amsTrays: AmsTrayInfo[];
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
    filamentType: null,
    amsTrays: [],
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

  // Extract AMS tray inventory and active filament type
  const ams = report.ams as Record<string, unknown> | undefined;
  const vtTray = report.vt_tray as Record<string, unknown> | undefined;

  if (ams && typeof ams === "object") {
    // Parse all AMS tray slots into amsTrays[]
    const amsUnits = ams.ams as Record<string, unknown>[] | undefined;
    if (Array.isArray(amsUnits)) {
      const trays: AmsTrayInfo[] = [];
      for (const unit of amsUnits) {
        const unitId = typeof unit.id === "string" ? parseInt(unit.id, 10) : -1;
        if (isNaN(unitId) || unitId < 0) continue;
        const unitTrays = unit.tray as Record<string, unknown>[] | undefined;
        if (!Array.isArray(unitTrays)) continue;
        for (const t of unitTrays) {
          const slotId = typeof t.id === "string" ? parseInt(t.id, 10) : -1;
          if (isNaN(slotId) || slotId < 0) continue;
          const globalTrayId = unitId * 4 + slotId;
          // A tray with only "id" (and optionally "state") keys is empty
          const keys = Object.keys(t).filter(
            (k) => k !== "id" && k !== "state",
          );
          const isEmpty = keys.length === 0;
          trays.push({
            trayId: globalTrayId,
            trayType: typeof t.tray_type === "string" ? t.tray_type : "",
            traySubBrands:
              typeof t.tray_sub_brands === "string" ? t.tray_sub_brands : "",
            trayColor: typeof t.tray_color === "string" ? t.tray_color : "",
            trayInfoIdx:
              typeof t.tray_info_idx === "string" ? t.tray_info_idx : "",
            remain: typeof t.remain === "number" ? t.remain : -1,
            isEmpty,
          });
        }
      }
      // Include external spool (vt_tray) as tray 254 if present
      if (vtTray && typeof vtTray === "object") {
        const vtKeys = Object.keys(vtTray).filter(
          (k) => k !== "id" && k !== "state",
        );
        trays.push({
          trayId: 254,
          trayType:
            typeof vtTray.tray_type === "string" ? vtTray.tray_type : "",
          traySubBrands:
            typeof vtTray.tray_sub_brands === "string"
              ? vtTray.tray_sub_brands
              : "",
          trayColor:
            typeof vtTray.tray_color === "string" ? vtTray.tray_color : "",
          trayInfoIdx:
            typeof vtTray.tray_info_idx === "string"
              ? vtTray.tray_info_idx
              : "",
          remain: typeof vtTray.remain === "number" ? vtTray.remain : -1,
          isEmpty: vtKeys.length === 0,
        });
      }
      status.amsTrays = trays;
    }

    // Extract active filament type from tray_now
    const trayNow = typeof ams.tray_now === "string" ? ams.tray_now : null;

    if (trayNow === "254" || trayNow === "255") {
      // External spool
      if (vtTray && typeof vtTray.tray_type === "string" && vtTray.tray_type) {
        status.filamentType = vtTray.tray_type;
      }
    } else if (trayNow !== null && trayNow !== "") {
      // AMS tray
      const trayIndex = parseInt(trayNow, 10);
      if (!isNaN(trayIndex)) {
        const activeTray = status.amsTrays.find((t) => t.trayId === trayIndex);
        if (activeTray?.trayType) {
          status.filamentType = activeTray.trayType;
        }
      }
    }
  } else if (vtTray && typeof vtTray === "object") {
    // No AMS data but virtual tray data available (external spool only)
    if (typeof vtTray.tray_type === "string" && vtTray.tray_type) {
      status.filamentType = vtTray.tray_type;
    }
  }
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
  validateBambuInputs({ ipAddress, accessCode, serialNumber });
  if (monitorCache.has(serialNumber)) return;

  const reportTopic = `device/${serialNumber}/report`;
  const requestTopic = `device/${serialNumber}/request`;
  const clientId = `inventory-monitor-${serialNumber}-${Date.now()}`;

  const status = createEmptyStatus();

  const client = mqtt.connect(`mqtts://${ipAddress}:${BAMBU_MQTT_PORT}`, {
    username: BAMBU_MQTT_USER,
    password: accessCode,
    clientId,
    // SECURITY: Bambu printers use self-signed TLS certificates.
    // rejectUnauthorized must be false to connect. MitM risk is limited
    // to the local network where the printer resides.
    rejectUnauthorized: false,
    protocol: "mqtts",
    protocolVersion: 4, // MQTT 3.1.1 — Bambu printers don't support MQTT 5.0
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
  validateBambuInputs({ ipAddress, accessCode, serialNumber });
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
