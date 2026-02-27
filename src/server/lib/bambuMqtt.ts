// ─── Shared Bambu MQTT Connection Pool ──────────────────────────────────────
// Single MQTT connection per Bambu printer, shared by status monitoring and
// metrics collection.  Bambu printers only support one concurrent MQTT client,
// so every consumer must go through this pool.
//
// Consumers register message listeners via `addMessageListener()`.  The pool
// periodically re-syncs with the database so newly-added printers are picked
// up within 60 s (or immediately via `syncBambuMqttPool()`).

import mqtt from "mqtt";
import { prisma } from "@/server/lib/prisma";

// ─── Constants ──────────────────────────────────────────────────────────────

const BAMBU_MQTT_PORT = 8883;
const BAMBU_MQTT_USER = "bblp";
const SYNC_INTERVAL_MS = 60_000; // Re-sync with DB every 60 s

// ─── Types ──────────────────────────────────────────────────────────────────

/** Called for every parsed MQTT message received from any pooled printer. */
export type BambuMessageListener = (
  serialNumber: string,
  printerName: string,
  msg: Record<string, unknown>,
) => void;

interface PoolEntry {
  client: mqtt.MqttClient;
  printerName: string;
  ipAddress: string;
  authToken: string;
  connecting: boolean;
}

// ─── Module-level state ─────────────────────────────────────────────────────

const pool = new Map<string, PoolEntry>();
const listeners = new Set<BambuMessageListener>();
let syncIntervalHandle: ReturnType<typeof setInterval> | null = null;

// ─── Listener management ────────────────────────────────────────────────────

export function addMessageListener(listener: BambuMessageListener): void {
  listeners.add(listener);
}

export function removeMessageListener(listener: BambuMessageListener): void {
  listeners.delete(listener);
}

// ─── Pool queries ───────────────────────────────────────────────────────────

/**
 * Returns the connected MQTT client for a printer, or `null` if the printer
 * is not in the pool / still connecting.  Used by bambu.ts for publishing
 * commands without opening a second connection.
 */
export function getPoolClient(serialNumber: string): mqtt.MqttClient | null {
  const entry = pool.get(serialNumber);
  if (!entry || entry.connecting || !entry.client.connected) return null;
  return entry.client;
}

// ─── Internal connection management ─────────────────────────────────────────

function connectPrinter(printer: {
  name: string;
  ipAddress: string;
  authToken: string;
  serialNumber: string;
}): void {
  if (pool.has(printer.serialNumber)) return;

  const reportTopic = `device/${printer.serialNumber}/report`;
  const requestTopic = `device/${printer.serialNumber}/request`;
  const clientId = `inventory-${printer.serialNumber}-${Date.now()}`;

  const client = mqtt.connect(
    `mqtts://${printer.ipAddress}:${BAMBU_MQTT_PORT}`,
    {
      username: BAMBU_MQTT_USER,
      password: printer.authToken,
      clientId,
      rejectUnauthorized: false,
      protocol: "mqtts",
      protocolVersion: 4, // MQTT 3.1.1 — Bambu printers don't support 5.0
      connectTimeout: 10_000,
      reconnectPeriod: 5_000,
    },
  );

  const entry: PoolEntry = {
    client,
    printerName: printer.name,
    ipAddress: printer.ipAddress,
    authToken: printer.authToken,
    connecting: true,
  };

  pool.set(printer.serialNumber, entry);

  client.on("connect", () => {
    entry.connecting = false;
    console.log(
      `[bambu-mqtt] Connected to ${printer.name} (${printer.ipAddress})`,
    );
    client.subscribe(reportTopic, { qos: 0 }, (err) => {
      if (err) {
        console.error(
          `[bambu-mqtt] Subscribe failed for ${printer.name}:`,
          err.message,
        );
        return;
      }
      // Request full status dump so listeners get initial state immediately
      const pushallPayload = JSON.stringify({
        pushing: { sequence_id: "0", command: "pushall" },
      });
      client.publish(requestTopic, pushallPayload, { qos: 0 });
    });
  });

  client.on("message", (_topic, payload) => {
    try {
      const msg = JSON.parse(payload.toString()) as Record<string, unknown>;
      for (const listener of listeners) {
        try {
          listener(printer.serialNumber, printer.name, msg);
        } catch {
          // Listener errors must not crash the pool
        }
      }
    } catch {
      // Ignore malformed messages
    }
  });

  client.on("error", (err) => {
    console.error(`[bambu-mqtt] MQTT error for ${printer.name}:`, err.message);
  });

  client.on("close", () => {
    // Auto-reconnect is enabled — no manual cleanup needed
  });
}

function disconnectPrinter(serial: string): void {
  const entry = pool.get(serial);
  if (!entry) return;
  console.log(`[bambu-mqtt] Disconnecting ${entry.printerName}`);
  try {
    entry.client.end(true);
  } catch {
    // Ignore cleanup errors
  }
  pool.delete(serial);
}

// ─── Sync with database ─────────────────────────────────────────────────────

/**
 * Re-reads BAMBU printers from the database and reconciles the pool:
 * - Connects any new printers
 * - Reconnects printers whose IP or auth token changed
 * - Disconnects printers that were removed from the DB
 *
 * Safe to call from anywhere (idempotent).  Also runs automatically on a
 * 60 s interval after `initBambuMqttPool()`.
 */
export async function syncBambuMqttPool(): Promise<void> {
  try {
    const printers = await prisma.printer.findMany({
      where: { type: "BAMBU" },
      select: {
        name: true,
        ipAddress: true,
        authToken: true,
        serialNumber: true,
      },
    });

    const dbSerials = new Set<string>();

    for (const printer of printers) {
      if (!printer.authToken || !printer.serialNumber) continue;
      dbSerials.add(printer.serialNumber);

      const existing = pool.get(printer.serialNumber);
      if (existing) {
        // Reconnect if IP or auth token changed
        if (
          existing.ipAddress !== printer.ipAddress ||
          existing.authToken !== printer.authToken
        ) {
          disconnectPrinter(printer.serialNumber);
          connectPrinter({
            name: printer.name,
            ipAddress: printer.ipAddress,
            authToken: printer.authToken,
            serialNumber: printer.serialNumber,
          });
        }
        continue;
      }

      connectPrinter({
        name: printer.name,
        ipAddress: printer.ipAddress,
        authToken: printer.authToken,
        serialNumber: printer.serialNumber,
      });
    }

    // Disconnect printers removed from DB
    for (const [serial] of pool) {
      if (!dbSerials.has(serial)) {
        disconnectPrinter(serial);
      }
    }
  } catch (err) {
    console.error("[bambu-mqtt] Sync failed:", err);
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Initialize the pool: connect all BAMBU printers from the DB and start
 * the periodic sync interval.  Call once at server startup.
 */
export async function initBambuMqttPool(): Promise<void> {
  await syncBambuMqttPool();
  syncIntervalHandle = setInterval(syncBambuMqttPool, SYNC_INTERVAL_MS);
  console.log(`[bambu-mqtt] Pool initialized with ${pool.size} connection(s)`);
}

/** Disconnect all printers and clear state.  For graceful shutdown. */
export function shutdownBambuMqttPool(): void {
  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }
  for (const [serial] of pool) {
    disconnectPrinter(serial);
  }
  listeners.clear();
}
