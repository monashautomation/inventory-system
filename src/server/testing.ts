// src/setup/server.js
import type { ChildProcess } from "child_process";

let serverProcess: ChildProcess | undefined;

export async function startServer() {
  try {
    const { spawn } = await import("child_process");
    serverProcess = spawn("ts-node", ["server/index.ts"]);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for server to start
  } catch {
    // child_process unavailable (e.g. jsdom environment) — skip server start
  }
}

export function stopServer() {
  serverProcess?.kill();
}
