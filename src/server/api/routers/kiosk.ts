import { router, kioskProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { getStudentInfo, postDiscordMessage } from "@/server/lib/external-api";
import { itemCheckout } from "../utils/item/item.checkout";
import { itemCheckin } from "../utils/item/item.checkin";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const AFTER_HOURS_DURATIONS = [
  "30 minutes",
  "1 hour",
  "1.5 hours",
  "2 hours",
  "3 hours",
  "4+ hours",
] as const;

const AFTER_HOURS_REASONS = [
  "Project work",
  "Study / Research",
  "Club activities",
  "Equipment maintenance",
  "Event setup",
  "Other",
] as const;

const DISCORD_AFTER_HOURS_CHANNEL =
  process.env.DISCORD_AFTER_HOURS_CHANNEL ?? "after-hours-log";

// Alphanumeric student IDs only — prevents path traversal in external API calls
const studentIdSchema = z.string().regex(/^[A-Za-z0-9]{1,20}$/);

async function resolveUser(studentId: string) {
  const studentInfo = await getStudentInfo(studentId);
  const user = await prisma.user.findFirst({
    where: { email: studentInfo.email },
  });
  return { studentInfo, user };
}

// Escape Discord markdown to prevent log forgery and mention abuse
function escapeDiscordMarkdown(text: string): string {
  return text
    .replace(/[`*_~|>\\]/g, "\\$&")
    .replace(/[\r\n]+/g, " ")
    .replace(/@/g, "@​");
}

export const kioskRouter = router({
  lookupStudent: kioskProcedure
    .input(z.object({ studentId: studentIdSchema }))
    .mutation(async ({ input }) => {
      const { studentInfo, user } = await resolveUser(input.studentId);

      if (!user) {
        // Only return name — email and discordId are not needed by the UI
        return {
          found: false as const,
          studentInfo: {
            studentId: studentInfo.studentId,
            name: studentInfo.name,
          },
          user: null,
        };
      }

      return {
        found: true as const,
        studentInfo: {
          studentId: studentInfo.studentId,
          name: studentInfo.name,
        },
        user: { id: user.id, name: user.name, email: user.email },
      };
    }),

  getSupervisors: kioskProcedure.query(async () => {
    return prisma.user.findMany({
      where: { role: { in: ["admin", "moderator"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }),

  getAfterHoursOptions: kioskProcedure.query(() => {
    return {
      durations: AFTER_HOURS_DURATIONS,
      reasons: AFTER_HOURS_REASONS,
    };
  }),

  logAfterHours: kioskProcedure
    .input(
      z.object({
        studentId: studentIdSchema,
        duration: z.enum(AFTER_HOURS_DURATIONS),
        reason: z.enum(AFTER_HOURS_REASONS),
        supervisorId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { studentInfo, user } = await resolveUser(input.studentId);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found for this student ID",
        });
      }

      let supervisorName = "None declared";
      if (input.supervisorId) {
        const supervisor = await prisma.user.findUnique({
          where: { id: input.supervisorId },
          select: { name: true, role: true },
        });
        if (supervisor && ["admin", "moderator"].includes(supervisor.role)) {
          supervisorName = supervisor.name;
        }
      }

      const timestamp = new Date().toLocaleString("en-AU", {
        timeZone: "Australia/Melbourne",
        dateStyle: "short",
        timeStyle: "short",
      });

      const text = [
        "🌙 **After Hours Access Log**",
        `👤 **Student:** ${escapeDiscordMarkdown(studentInfo.name)} (${escapeDiscordMarkdown(studentInfo.email)})`,
        `🕐 **Duration:** ${input.duration}`,
        `📋 **Reason:** ${input.reason}`,
        `👔 **Supervisor:** ${escapeDiscordMarkdown(supervisorName)}`,
        `📅 **Time:** ${timestamp}`,
      ].join("\n");

      await postDiscordMessage({
        channel: DISCORD_AFTER_HOURS_CHANNEL,
        text,
      });

      return { ok: true };
    }),

  getItemByQR: kioskProcedure
    .input(z.object({ qrData: z.string() }))
    .mutation(async ({ input }) => {
      const segments = input.qrData.trim().split("/");
      const qrIndex = segments.indexOf("qr");
      const itemId =
        qrIndex !== -1
          ? (segments[qrIndex + 1] ?? "")
          : (segments[segments.length - 1] ?? "");

      if (!itemId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid QR code",
        });
      }

      const item = await prisma.item.findUnique({
        where: { id: itemId, deleted: false },
        select: {
          id: true,
          name: true,
          serial: true,
          consumable: { select: { available: true } },
          ItemRecords: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { loaned: true },
          },
        },
      });

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }

      return item;
    }),

  checkoutItems: kioskProcedure
    .input(
      z.object({
        studentId: studentIdSchema,
        itemIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { user } = await resolveUser(input.studentId);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found for this student ID",
        });
      }

      const cart = input.itemIds.map((id) => ({ itemId: id, quantity: 1 }));
      const result = await itemCheckout(user.id, cart);
      return result;
    }),

  getUserLoanedItems: kioskProcedure
    .input(z.object({ studentId: studentIdSchema }))
    .query(async ({ input }) => {
      const { user } = await resolveUser(input.studentId);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found for this student ID",
        });
      }

      // Step 1: candidate itemIds where this user has ever had a loaned=true record
      const candidates = await prisma.itemRecord.findMany({
        where: {
          actionByUserId: user.id,
          loaned: true,
          item: { deleted: false },
        },
        select: { itemId: true },
        distinct: ["itemId"],
      });

      // Step 2: for each candidate, fetch the latest record overall.
      // Include only items whose most recent record is still loaned by this user.
      const results = await Promise.all(
        candidates.map(async ({ itemId }) => {
          const latest = await prisma.itemRecord.findFirst({
            where: { itemId },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              itemId: true,
              loaned: true,
              createdAt: true,
              actionByUserId: true,
              item: { select: { id: true, name: true, serial: true } },
            },
          });

          if (!latest || !latest.loaned || latest.actionByUserId !== user.id) {
            return null;
          }

          return latest;
        }),
      );

      return results.filter((r) => r !== null);
    }),

  checkinItems: kioskProcedure
    .input(
      z.object({
        studentId: studentIdSchema,
        itemIds: z.array(z.string().uuid()).min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const { user } = await resolveUser(input.studentId);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found for this student ID",
        });
      }

      // Verify each item is currently loaned to this user before checking in
      const ownershipChecks = await Promise.all(
        input.itemIds.map(async (itemId) => {
          const latest = await prisma.itemRecord.findFirst({
            where: { itemId },
            orderBy: { createdAt: "desc" },
            select: { loaned: true, actionByUserId: true },
          });
          const owned =
            latest?.loaned === true && latest.actionByUserId === user.id;
          return { itemId, owned };
        }),
      );

      const notOwned = ownershipChecks.filter((c) => !c.owned);
      if (notOwned.length > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more items are not currently loaned to this student",
        });
      }

      const cart = input.itemIds.map((id) => ({ itemId: id, quantity: 1 }));
      const result = await itemCheckin(user.id, cart);
      return result;
    }),
});
