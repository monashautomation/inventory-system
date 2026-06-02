/**
 * Stubs for external APIs. Replace each function body when credentials are available.
 *
 * Student API: GET /api/students/{studentId} → { name, email, discordId }
 * Discord API: POST /api/discord/message     → { channel, text }
 */

import { logger as rootLogger } from "./logger";

const logger = rootLogger.child({ module: "external-api" });

export interface StudentInfo {
  studentId: string;
  name: string;
  email: string;
  discordId: string;
}

export interface DiscordMessagePayload {
  channel: string;
  text: string;
}

export async function getStudentInfo(studentId: string): Promise<StudentInfo> {
  // Read env vars at call time so tests can override process.env
  const STUDENT_API_BASE = process.env.STUDENT_API_BASE ?? "";
  const STUDENT_API_KEY = process.env.STUDENT_API_KEY ?? "";

  if (!STUDENT_API_BASE) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error(
        "STUDENT_API_BASE is required in non-development environments",
      );
    }
    return {
      studentId,
      name: "Test Student",
      email: "test@student.monash.edu",
      discordId: "000000000000000000",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(
      `${STUDENT_API_BASE}/members/${encodeURIComponent(studentId)}`,
      {
        headers: {
          Authorization: `Bearer ${STUDENT_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      },
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Student API timeout after 30s");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 404) {
      const err = new Error("Member not found") as Error & {
        code: string;
      };
      err.code = "MEMBER_NOT_FOUND";
      throw err;
    }
    const body = await res.text().catch(() => "<unreadable>");
    logger.error(
      { status: res.status, statusText: res.statusText, studentId, body },
      "Student API error",
    );
    throw new Error(`Student API error: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as { error?: string } & {
    id?: string;
    name?: string;
    student_number?: string;
    email?: string;
    discord_id?: string;
  };

  if (body.error) {
    const err = new Error(body.error) as Error & { code: string };
    err.code = "MEMBER_NOT_FOUND";
    throw err;
  }

  const raw = body as {
    id: string;
    name: string;
    student_number: string;
    email: string;
    discord_id: string;
  };

  return {
    studentId: raw.student_number ?? studentId,
    name: raw.name,
    email: raw.email,
    discordId: raw.discord_id,
  };
}

export interface NotionProject {
  id: string;
  name: string;
}

export async function getActiveProjects(): Promise<NotionProject[]> {
  const STUDENT_API_BASE = process.env.STUDENT_API_BASE ?? "";
  const STUDENT_API_KEY = process.env.STUDENT_API_KEY ?? "";

  if (!STUDENT_API_BASE) {
    return [
      { id: "proj-stub-1", name: "Example Project A" },
      { id: "proj-stub-2", name: "Example Project B" },
    ];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch(`${STUDENT_API_BASE}/projects`, {
      headers: {
        Authorization: `Bearer ${STUDENT_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Projects API timeout after 15s");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`Projects API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as unknown;
  const items: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>).projects)
      ? ((data as Record<string, unknown>).projects as unknown[])
      : Array.isArray((data as Record<string, unknown>).items)
        ? ((data as Record<string, unknown>).items as unknown[])
        : [];

  return items
    .filter(
      (p): p is { id: string; name: string } =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as Record<string, unknown>).id === "string" &&
        typeof (p as Record<string, unknown>).name === "string",
    )
    .map((p) => ({ id: p.id, name: p.name }));
}

export async function postDiscordMessage(
  payload: DiscordMessagePayload,
): Promise<void> {
  const STUDENT_API_BASE = process.env.STUDENT_API_BASE ?? "";
  const STUDENT_API_KEY = process.env.STUDENT_API_KEY ?? "";

  if (!STUDENT_API_BASE) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error(
        "STUDENT_API_BASE is required in non-development environments",
      );
    }
    logger.debug(
      { channel: payload.channel, text: payload.text },
      "Discord stub",
    );
    return;
  }

  const res = await fetch(`${STUDENT_API_BASE}/afterhours`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STUDENT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: payload.text }),
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }
}
