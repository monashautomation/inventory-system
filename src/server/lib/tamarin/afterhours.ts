export interface AfterHoursRequest {
  message: string;
}

async function resolveUsernameToId(
  botToken: string,
  guildId: string,
  username: string,
): Promise<string | null> {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/search?query=${encodeURIComponent(username)}&limit=10`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bot ${botToken}` },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const members = (await res.json()) as Record<string, unknown>[];
  for (const member of members) {
    const nick = (member.nick as string | null) ?? "";
    const user = member.user as Record<string, unknown>;
    const global = (user?.username as string) ?? "";
    if (
      nick.toLowerCase() === username.toLowerCase() ||
      global.toLowerCase() === username.toLowerCase()
    ) {
      return (user?.id as string) ?? null;
    }
  }

  return null;
}

export async function resolveMentions(
  botToken: string,
  guildId: string,
  message: string,
): Promise<string> {
  const mentionRe = /<@([^>]+)>/g;
  let resolved = message;
  const usernames = [...message.matchAll(mentionRe)].map((m) => m[1]);

  for (const username of usernames) {
    if (/^\d+$/.test(username)) continue;
    const id = await resolveUsernameToId(botToken, guildId, username);
    if (id) {
      resolved = resolved.split(`<@${username}>`).join(`<@${id}>`);
    }
  }

  return resolved;
}

export async function postAfterHours(
  webhookUrl: string,
  botToken: string,
  guildId: string,
  body: AfterHoursRequest,
): Promise<{ ok: boolean }> {
  const message = await resolveMentions(botToken, guildId, body.message);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: message,
      allowed_mentions: { parse: ["users", "roles"] },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(
      new Error(`Discord webhook returned ${res.status}: ${text}`),
      { discordStatus: res.status },
    );
  }

  return { ok: true };
}
