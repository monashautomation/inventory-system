import { logger as rootLogger } from "./logger";
import { getTamarinService } from "./tamarin/service";

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

export interface NotionProject {
  id: string;
  name: string;
}

export async function getStudentInfo(studentId: string): Promise<StudentInfo> {
  const tamarin = getTamarinService();

  if (!tamarin) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error("Tamarin is not configured (missing env vars)");
    }
    return {
      studentId,
      name: "Test Student",
      email: "test@student.monash.edu",
      discordId: "000000000000000000",
    };
  }

  const member = await tamarin.getMember(studentId);
  return {
    studentId: member.student_number || studentId,
    name: member.name,
    email: member.email,
    discordId: member.discord_id,
  };
}

export async function getActiveProjects(): Promise<NotionProject[]> {
  const tamarin = getTamarinService();

  if (!tamarin) {
    return [
      { id: "proj-stub-1", name: "Example Project A" },
      { id: "proj-stub-2", name: "Example Project B" },
    ];
  }

  return tamarin.getProjects();
}

export async function checkDiscordGuildMember(
  discordUsername: string,
): Promise<boolean> {
  const guildId = process.env.AFTER_HOURS_GUILD_ID;
  const botToken = process.env.AFTER_HOURS_BOT_TOKEN;

  if (!guildId || !botToken) {
    return true;
  }

  const query = discordUsername.trim().toLowerCase();
  const url = `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/members/search?query=${encodeURIComponent(query)}&limit=25`;

  let members: Record<string, unknown>[];
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return true; // API error — don't flag as invalid
    members = (await res.json()) as Record<string, unknown>[];
  } catch {
    return true; // network failure — don't show false warnings
  }

  return members.some((member) => {
    const user = member.user as Record<string, unknown> | undefined;
    const username = ((user?.username as string) ?? "").toLowerCase();
    const globalName = ((user?.global_name as string) ?? "").toLowerCase();
    const nick = ((member.nick as string) ?? "").toLowerCase();

    // exact match on username (canonical check)
    if (username === query) return true;
    // nick may have suffixes added by server (e.g. "person_2099 | Year 1")
    if (
      nick === query ||
      nick.startsWith(query + " ") ||
      nick.startsWith(query + "|")
    )
      return true;
    // global_name fallback
    if (globalName === query) return true;

    return false;
  });
}

export async function postDiscordMessage(
  payload: DiscordMessagePayload,
): Promise<void> {
  const tamarin = getTamarinService();

  if (!tamarin) {
    if (
      process.env.NODE_ENV !== "development" &&
      process.env.NODE_ENV !== "test"
    ) {
      throw new Error("Tamarin is not configured (missing env vars)");
    }
    logger.debug(
      { channel: payload.channel, text: payload.text },
      "Discord stub",
    );
    return;
  }

  await tamarin.postAfterHours({ message: payload.text });
}
