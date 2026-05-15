import { router, kioskProcedure, adminProcedure } from "@/server/trpc";
import { prisma } from "@/server/lib/prisma";
import { getStudentInfo, postDiscordMessage } from "@/server/lib/external-api";
import { itemCheckout } from "../utils/item/item.checkout";
import { itemCheckin } from "../utils/item/item.checkin";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

const AFTER_HOURS_DURATIONS = [
  "30 minutes",
  "1 hour",
  "2 hours",
  "3 hours",
  "4 hours",
  "5 hours",
  "6 hours",
  "7 hours",
  "8 hours",
  "9 hours",
  "10 hours",
] as const;

const AFTER_HOURS_REASONS = [
  "Project Work",
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
  let studentInfo;
  try {
    studentInfo = await getStudentInfo(studentId);
  } catch (err) {
    if (
      err instanceof Error &&
      (err as Error & { code?: string }).code === "MEMBER_NOT_FOUND"
    ) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "MEMBER_NOT_FOUND",
      });
    }
    throw err;
  }
  const user = await prisma.user.findFirst({
    where: { email: studentInfo.email },
  });

  if (user && !user.studentNumber) {
    await prisma.user.update({
      where: { id: user.id },
      data: { studentNumber: studentInfo.studentId },
    });
  }

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
        return {
          found: false as const,
          user: null,
          studentInfo: {
            studentId: studentInfo.studentId,
            name: studentInfo.name,
            email: studentInfo.email,
            discordId: studentInfo.discordId,
          },
        };
      }

      return {
        found: true as const,
        studentInfo: {
          studentId: studentInfo.studentId,
          name: studentInfo.name,
          email: studentInfo.email,
          discordId: studentInfo.discordId,
        },
        user: { id: user.id, name: user.name, email: user.email },
      };
    }),

  getSupervisors: kioskProcedure.query(async () => {
    return prisma.user.findMany({
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
      z
        .object({
          studentId: studentIdSchema,
          duration: z.enum(AFTER_HOURS_DURATIONS),
          reason: z.enum(AFTER_HOURS_REASONS),
          customReason: z.string().min(1).max(200).optional(),
          supervisorId: z.string().min(1).optional(),
        })
        .refine(
          (data) =>
            data.reason !== "Other" ||
            (data.customReason?.trim().length ?? 0) > 0,
          {
            message: "Custom reason required when reason is Other",
            path: ["customReason"],
          },
        ),
    )
    .mutation(async ({ input }) => {
      const { studentInfo, user } = await resolveUser(input.studentId);

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No account found for this student ID",
        });
      }

      let supervisorMention = "None declared";
      if (input.supervisorId) {
        const supervisor = await prisma.user.findUnique({
          where: { id: input.supervisorId },
          select: { name: true, studentNumber: true },
        });
        if (!supervisor) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Selected supervisor no longer exists",
          });
        }
        if (supervisor.studentNumber) {
          try {
            const supervisorInfo = await getStudentInfo(
              supervisor.studentNumber,
            );
            supervisorMention = `<@${supervisorInfo.discordId}>`;
          } catch {
            supervisorMention = escapeDiscordMarkdown(supervisor.name);
          }
        } else {
          supervisorMention = escapeDiscordMarkdown(supervisor.name);
        }
      }

      const date = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        day: "2-digit",
        month: "2-digit",
      }).format(new Date());

      const durationMinutesByLabel: Record<
        (typeof AFTER_HOURS_DURATIONS)[number],
        number
      > = {
        "30 minutes": 30,
        "1 hour": 60,
        "2 hours": 120,
        "3 hours": 180,
        "4 hours": 240,
        "5 hours": 300,
        "6 hours": 360,
        "7 hours": 420,
        "8 hours": 480,
        "9 hours": 540,
        "10 hours": 600,
      };

      const now = new Date();
      const endTime = new Date(
        now.getTime() + durationMinutesByLabel[input.duration] * 60 * 1000,
      );

      const timeFormatter = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      const startTimeText = timeFormatter.format(now).toLowerCase();
      const endTimeText = timeFormatter.format(endTime).toLowerCase();

      const text = [
        "<@Keenan>",
        `Who: <@${studentInfo.discordId}>`,
        `Day: ${date}`,
        `Time: ${startTimeText} - ${endTimeText}`,
        `Activity: ${input.reason === "Other" ? escapeDiscordMarkdown(input.customReason!) : input.reason}`,
        ...(input.supervisorId ? [`Supervisor: ${supervisorMention}`] : []),
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
          stored: true,
          image: true,
          consumable: { select: { available: true } },
          ItemRecords: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { loaned: true },
          },
        },
      });

      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Item not found",
        });
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

      const cart = input.itemIds.map((id) => ({
        itemId: id,
        quantity: 1,
      }));
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

      // Fetch candidate itemIds where this user has ever had a loaned=true record
      const candidates = await prisma.itemRecord.findMany({
        where: {
          actionByUserId: user.id,
          loaned: true,
          item: { deleted: false },
        },
        select: { itemId: true },
        distinct: ["itemId"],
      });

      const candidateIds = candidates.map((c) => c.itemId);
      if (candidateIds.length === 0) return [];

      // Fetch the latest record for each candidate in a single query, then filter
      // to items still loaned by this user.
      const latestRecords = await prisma.itemRecord.findMany({
        where: { itemId: { in: candidateIds } },
        orderBy: { createdAt: "desc" },
        distinct: ["itemId"],
        select: {
          id: true,
          itemId: true,
          loaned: true,
          createdAt: true,
          actionByUserId: true,
          item: { select: { id: true, name: true, serial: true, image: true } },
        },
      });

      return latestRecords.filter(
        (r) => r.loaned && r.actionByUserId === user.id,
      );
    }),

  provisionTerminal: adminProcedure.mutation(() => {
    const token = process.env.KIOSK_SECRET;
    if (!token) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "KIOSK_SECRET not configured",
      });
    }
    return { token };
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

      const cart = input.itemIds.map((id) => ({
        itemId: id,
        quantity: 1,
      }));
      const result = await itemCheckin(user.id, cart);
      return result;
    }),
});
