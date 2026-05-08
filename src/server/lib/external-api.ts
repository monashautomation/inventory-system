/**
 * Stubs for external APIs. Replace each function body when credentials are available.
 *
 * Student API: GET /api/students/{studentId} → { name, email, discordId }
 * Discord API: POST /api/discord/message     → { channel, text }
 */

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

  const res = await fetch(
    `${STUDENT_API_BASE}/members/${encodeURIComponent(studentId)}`,
    {
      headers: {
        Authorization: `Bearer ${STUDENT_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    if (res.status === 404) {
      const err = new Error("Member not found") as Error & {
        code: string;
      };
      err.code = "MEMBER_NOT_FOUND";
      throw err;
    }
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

export async function postDiscordMessage(
  payload: DiscordMessagePayload,
): Promise<void> {
  const DISCORD_API_BASE = process.env.DISCORD_API_BASE ?? "";
  const STUDENT_API_KEY = process.env.STUDENT_API_KEY ?? "";

  if (!DISCORD_API_BASE) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error(
        "DISCORD_API_BASE is required in non-development environments",
      );
    }
    console.log("[Discord stub] channel:", payload.channel);
    console.log("[Discord stub] text:", payload.text);
    return;
  }

  const res = await fetch(`${DISCORD_API_BASE}/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STUDENT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }
}
