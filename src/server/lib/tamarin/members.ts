import type { NotionClient } from "./notion";

const PROP_STUDENT_NUMBER = "Student ID";
const PROP_NAME = "Name";
const PROP_EMAIL = "Monash Email";
const PROP_DISCORD_ID = "Discord";

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface Member {
  id: string;
  name: string;
  student_number: string;
  email: string;
  discord_id: string;
}

interface CacheEntry {
  member: Member;
  expiresAt: number;
}

export class MemberCache {
  private store = new Map<string, CacheEntry>();

  get(key: string): Member | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.member;
  }

  set(key: string, member: Member): void {
    this.store.set(key, { member, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}

export async function getAllMembers(
  notion: NotionClient,
  dbId: string,
): Promise<Member[]> {
  const pages = await notion.queryDatabaseAll(dbId);
  return pages.map((page) => {
    const props = page.properties as Record<string, unknown>;
    return {
      id: (page.id as string) ?? "",
      name: extractTitle(props, PROP_NAME),
      student_number: extractRichText(props, PROP_STUDENT_NUMBER),
      email: extractEmail(props, PROP_EMAIL),
      discord_id: extractRichText(props, PROP_DISCORD_ID),
    };
  });
}

export async function getMemberByEmail(
  notion: NotionClient,
  dbId: string,
  email: string,
): Promise<Member | null> {
  const filter = {
    property: PROP_EMAIL,
    email: { equals: email },
  };
  const pages = await notion.queryDatabaseAll(dbId, filter);
  const page = pages[0];
  if (!page) return null;
  const props = page.properties as Record<string, unknown>;
  return {
    id: (page.id as string) ?? "",
    name: extractTitle(props, PROP_NAME),
    student_number: extractRichText(props, PROP_STUDENT_NUMBER),
    email: extractEmail(props, PROP_EMAIL),
    discord_id: extractRichText(props, PROP_DISCORD_ID),
  };
}

export async function getMember(
  notion: NotionClient,
  dbId: string,
  studentNumber: string,
  cache: MemberCache,
): Promise<Member> {
  const key = studentNumber.trim().toLowerCase();

  const cached = cache.get(key);
  if (cached) return cached;

  const filter = {
    property: PROP_STUDENT_NUMBER,
    rich_text: { equals: key },
  };

  const result = (await notion.queryDatabase(dbId, filter)) as Record<
    string,
    unknown
  >;
  const pages = result.results as Record<string, unknown>[] | undefined;
  const page = pages?.[0];

  if (!page) {
    const err = new Error("Member not found");
    (err as NodeJS.ErrnoException).code = "NOT_FOUND";
    throw err;
  }

  const props = page.properties as Record<string, unknown>;
  const member: Member = {
    id: (page.id as string) ?? "",
    name: extractTitle(props, PROP_NAME),
    student_number: extractRichText(props, PROP_STUDENT_NUMBER),
    email: extractEmail(props, PROP_EMAIL),
    discord_id: extractRichText(props, PROP_DISCORD_ID),
  };

  cache.set(key, member);
  return member;
}

function extractTitle(props: Record<string, unknown>, key: string): string {
  const field = props[key] as Record<string, unknown> | undefined;
  const arr = field?.title as Record<string, unknown>[] | undefined;
  return (arr?.[0]?.plain_text as string) ?? "";
}

function extractRichText(props: Record<string, unknown>, key: string): string {
  const field = props[key] as Record<string, unknown> | undefined;
  const arr = field?.rich_text as Record<string, unknown>[] | undefined;
  return (arr?.[0]?.plain_text as string) ?? "";
}

function extractEmail(props: Record<string, unknown>, key: string): string {
  const field = props[key] as Record<string, unknown> | undefined;
  return (field?.email as string) ?? "";
}
