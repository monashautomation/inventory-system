import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: { service: "inventory-system" },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  isDev
    ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
    : undefined,
);
