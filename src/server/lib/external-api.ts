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
  const KIOSK_API_KEY = process.env.KIOSK_API_KEY ?? "";

  if (!STUDENT_API_BASE) {
    // Stub — returns mock data until real API is configured
    return {
      studentId,
      name: "Test Student",
      email: "test@student.monash.edu",
      discordId: "000000000000000000",
    };
  }

  const res = await fetch(`${STUDENT_API_BASE}/students/${studentId}`, {
    headers: {
      Authorization: `Bearer ${KIOSK_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Student API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as StudentInfo;
  return { ...data, studentId };
}

export async function postDiscordMessage(
  payload: DiscordMessagePayload,
): Promise<void> {
  const DISCORD_API_BASE = process.env.DISCORD_API_BASE ?? "";
  const KIOSK_API_KEY = process.env.KIOSK_API_KEY ?? "";

  if (!DISCORD_API_BASE) {
    // Stub — logs to console until real API is configured
    console.log("[Discord stub] channel:", payload.channel);
    console.log("[Discord stub] text:", payload.text);
    return;
  }

  const res = await fetch(`${DISCORD_API_BASE}/message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KIOSK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Discord API error: ${res.status} ${res.statusText}`);
  }
}
