import { NotionClient } from "./notion";
import { MemberCache, getMember } from "./members";
import type { Member } from "./members";
import { getProjects } from "./projects";
import type { Project } from "./projects";
import { postAfterHours } from "./afterhours";
import type { AfterHoursRequest } from "./afterhours";
import { initMemberSync } from "@/server/lib/member-sync";

export type { Member, Project, AfterHoursRequest };

export interface TamarinService {
  getMember(studentNumber: string): Promise<Member>;
  getProjects(): Promise<Project[]>;
  postAfterHours(body: AfterHoursRequest): Promise<{ ok: boolean }>;
}

// undefined = not yet initialized, null = env vars missing
let _service: TamarinService | null | undefined;

export function getTamarinService(): TamarinService | null {
  if (_service !== undefined) return _service;

  const notionToken = process.env.NOTION_TOKEN;
  const membersDbId = process.env.MEMBERS_DB_ID;
  const projectsDbId = process.env.PROJECTS_DB_ID;
  const webhookUrl = process.env.AFTER_HOURS_DISCORD_WEBHOOK;
  const guildId = process.env.AFTER_HOURS_GUILD_ID;
  const botToken = process.env.AFTER_HOURS_BOT_TOKEN;

  if (
    !notionToken ||
    !membersDbId ||
    !projectsDbId ||
    !webhookUrl ||
    !guildId ||
    !botToken
  ) {
    _service = null;
    return null;
  }

  const notion = new NotionClient(notionToken);
  const cache = new MemberCache();

  initMemberSync(notion, membersDbId);

  _service = {
    getMember: (studentNumber) =>
      getMember(notion, membersDbId, studentNumber, cache),
    getProjects: () => getProjects(notion, projectsDbId),
    postAfterHours: (body) =>
      postAfterHours(webhookUrl, botToken, guildId, body),
  };

  return _service;
}

export function resetTamarinService(): void {
  _service = undefined;
}
