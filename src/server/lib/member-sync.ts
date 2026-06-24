import { prisma } from "@/server/lib/prisma";
import { logger } from "@/server/lib/logger";
import { getAllMembers, getMemberByEmail } from "@/server/lib/tamarin/members";
import type { Member } from "@/server/lib/tamarin/members";
import type { NotionClient } from "@/server/lib/tamarin/notion";

const SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface SyncStatus {
  lastSyncAt: Date | null;
  totalCached: number;
  isSyncing: boolean;
  lastError: string | null;
}

// Snapshot keyed by Notion page ID → the last-seen member data
const snapshot = new Map<string, Member>();
let lastSyncAt: Date | null = null;
let isSyncing = false;
let lastError: string | null = null;
let notionClient: NotionClient | null = null;
let memberDbId: string | null = null;

export function initMemberSync(notion: NotionClient, dbId: string): void {
  notionClient = notion;
  memberDbId = dbId;
}

export function getMemberSyncStatus(): SyncStatus {
  return {
    lastSyncAt,
    totalCached: snapshot.size,
    isSyncing,
    lastError,
  };
}

interface SyncResult {
  scanned: number;
  updated: number;
  skipped: number;
}

export async function syncAllMembers(): Promise<SyncResult> {
  if (!notionClient || !memberDbId) {
    throw new Error("Member sync not configured — missing Notion credentials");
  }
  if (isSyncing) {
    throw new Error("Sync already in progress");
  }

  isSyncing = true;
  lastError = null;

  try {
    const members = await getAllMembers(notionClient, memberDbId);

    let updated = 0;
    let skipped = 0;

    for (const member of members) {
      if (!member.email) {
        skipped++;
        continue;
      }

      const prev = snapshot.get(member.id);
      const changed =
        !prev ||
        prev.name !== member.name ||
        prev.student_number !== member.student_number;

      // Always update snapshot entry
      snapshot.set(member.id, member);

      if (!changed) {
        skipped++;
        continue;
      }

      // Find user by email and update if they exist
      const user = await prisma.user.findUnique({
        where: { email: member.email },
        select: { id: true },
      });

      if (!user) {
        skipped++;
        continue;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: member.name || undefined,
          studentNumber: member.student_number || undefined,
        },
      });

      updated++;
    }

    lastSyncAt = new Date();
    logger.info(
      { scanned: members.length, updated, skipped },
      "Member sync completed",
    );

    return { scanned: members.length, updated, skipped };
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Member sync failed");
    throw err;
  } finally {
    isSyncing = false;
  }
}

export async function syncOneMember(
  userId: string,
): Promise<{ updated: boolean }> {
  if (!notionClient || !memberDbId) {
    throw new Error("Member sync not configured — missing Notion credentials");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) {
    throw new Error("User not found");
  }

  const member = await getMemberByEmail(notionClient, memberDbId, user.email);
  if (!member) return { updated: false };

  // Update snapshot
  snapshot.set(member.id, member);

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: member.name || undefined,
      studentNumber: member.student_number || undefined,
    },
  });

  return { updated: true };
}

export function startMemberSyncScheduler(): void {
  if (!notionClient || !memberDbId) {
    logger.debug("Member sync scheduler skipped — Notion not configured");
    return;
  }

  // Run immediately on startup, then every hour
  syncAllMembers().catch((err) =>
    logger.error({ err }, "Initial member sync failed"),
  );

  setInterval(() => {
    syncAllMembers().catch((err) =>
      logger.error({ err }, "Scheduled member sync failed"),
    );
  }, SYNC_INTERVAL_MS);
}
