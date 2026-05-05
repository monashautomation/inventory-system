import { describe, it, vi, expect, beforeEach, afterEach } from "vitest";
import { faker } from "@faker-js/faker";
import { TRPCError } from "@trpc/server";
import { createCallerFactory } from "@/server/trpc";
import { kioskRouter } from "../kiosk";
import prismaMock from "@/server/lib/__mocks__/prisma";
import {
  createUser,
  createAvailableAsset,
  createLoanedAsset,
} from "@/server/lib/dbMockFactory";
import * as externalApi from "@/server/lib/external-api";
import * as checkoutUtils from "@/server/api/utils/item/item.checkout";
import * as checkinUtils from "@/server/api/utils/item/item.checkin";

// prisma is globally mocked in vitest.setup.ts
vi.mock("@/server/lib/external-api");
vi.mock("@/server/api/utils/item/item.checkout");
vi.mock("@/server/api/utils/item/item.checkin");

// Clear call histories between tests (prismaMock reset is handled by __mocks__/prisma.ts)
afterEach(() => vi.clearAllMocks());

const createCaller = createCallerFactory(kioskRouter);
const caller = createCaller({
  prisma: prismaMock,
  user: undefined,
  req: {} as Request,
  res: {} as Response,
});

const makeStudentInfo = (
  overrides: Partial<externalApi.StudentInfo> = {},
): externalApi.StudentInfo => ({
  studentId: faker.string.numeric(8),
  name: faker.person.fullName(),
  email: faker.internet.email({ provider: "student.monash.edu" }),
  discordId: faker.string.numeric(18),
  ...overrides,
});

describe("kiosk router", () => {
  describe("lookupStudent", () => {
    it("returns found=true with user when DB match exists", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);

      const result = await caller.lookupStudent({
        studentId: studentInfo.studentId,
      });

      expect(result.found).toBe(true);
      expect(result.user?.id).toBe(dbUser.id);
      expect(result.studentInfo.email).toBe(studentInfo.email);
    });

    it("returns found=false when no DB user matches email", async () => {
      const studentInfo = makeStudentInfo();

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      const result = await caller.lookupStudent({
        studentId: studentInfo.studentId,
      });

      expect(result.found).toBe(false);
      expect(result.user).toBeNull();
      expect(result.studentInfo.name).toBe(studentInfo.name);
    });

    it("propagates external API error", async () => {
      vi.mocked(externalApi.getStudentInfo).mockRejectedValueOnce(
        new Error("Student API error: 503 Service Unavailable"),
      );

      await expect(
        caller.lookupStudent({ studentId: "12345678" }),
      ).rejects.toThrow("Student API error");
    });

    it("queries DB by email from external API response", async () => {
      const studentInfo = makeStudentInfo({
        email: "specific@student.monash.edu",
      });
      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await caller.lookupStudent({ studentId: studentInfo.studentId });

      expect(prismaMock.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: "specific@student.monash.edu" },
        }),
      );
    });
  });

  describe("logAfterHours", () => {
    it("posts Discord message with all details when supervisor provided", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });
      const supervisor = createUser({ name: "Dr. Smith" });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      prismaMock.user.findUnique.mockResolvedValueOnce(supervisor);
      vi.mocked(externalApi.postDiscordMessage).mockResolvedValueOnce(
        undefined,
      );

      const result = await caller.logAfterHours({
        studentId: studentInfo.studentId,
        duration: "1 hour",
        reason: "Project work",
        supervisorId: supervisor.id,
      });

      expect(result.ok).toBe(true);
      const call = vi.mocked(externalApi.postDiscordMessage).mock.calls[0]![0];
      expect(call.text).toContain(studentInfo.name);
      expect(call.text).toContain("1 hour");
      expect(call.text).toContain("Project work");
      expect(call.text).toContain("Dr. Smith");
    });

    it("uses 'None declared' when no supervisor provided", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(externalApi.postDiscordMessage).mockResolvedValueOnce(
        undefined,
      );

      await caller.logAfterHours({
        studentId: studentInfo.studentId,
        duration: "2 hours",
        reason: "Study / Research",
      });

      const call = vi.mocked(externalApi.postDiscordMessage).mock.calls[0]![0];
      expect(call.text).toContain("None declared");
    });

    it("throws NOT_FOUND when student has no DB account", async () => {
      const studentInfo = makeStudentInfo();
      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.logAfterHours({
          studentId: studentInfo.studentId,
          duration: "1 hour",
          reason: "Project work",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("Discord message includes student email", async () => {
      const studentInfo = makeStudentInfo({
        email: "check@student.monash.edu",
      });
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(externalApi.postDiscordMessage).mockResolvedValueOnce(
        undefined,
      );

      await caller.logAfterHours({
        studentId: studentInfo.studentId,
        duration: "30 minutes",
        reason: "Other",
      });

      const call = vi.mocked(externalApi.postDiscordMessage).mock.calls[0]![0];
      expect(call.text).toContain("check@student.monash.edu");
    });

    it("propagates Discord API failure", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(externalApi.postDiscordMessage).mockRejectedValueOnce(
        new Error("Discord API error: 503"),
      );

      await expect(
        caller.logAfterHours({
          studentId: studentInfo.studentId,
          duration: "1 hour",
          reason: "Project work",
        }),
      ).rejects.toThrow("Discord API error");
    });
  });

  describe("getItemByQR", () => {
    it("resolves item from full URL QR code", async () => {
      const item = createAvailableAsset();
      const qrData = `https://inventory.example.com/qr/${item.id}`;

      prismaMock.item.findUnique.mockResolvedValueOnce({
        ...item,
        ItemRecords: [],
      } as never);

      const result = await caller.getItemByQR({ qrData });

      expect(result.id).toBe(item.id);
    });

    it("resolves item from bare UUID QR code", async () => {
      const item = createAvailableAsset();

      prismaMock.item.findUnique.mockResolvedValueOnce({
        ...item,
        ItemRecords: [],
      } as never);

      const result = await caller.getItemByQR({ qrData: item.id });

      expect(result.id).toBe(item.id);
    });

    it("throws NOT_FOUND when item does not exist", async () => {
      prismaMock.item.findUnique.mockResolvedValueOnce(null);

      await expect(
        caller.getItemByQR({ qrData: faker.string.uuid() }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("throws BAD_REQUEST for empty QR data", async () => {
      await expect(caller.getItemByQR({ qrData: "/" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  describe("checkoutItems", () => {
    it("calls itemCheckout with user ID and item IDs", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });
      const item = createAvailableAsset();

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(checkoutUtils.itemCheckout).mockResolvedValueOnce({
        ok: true,
        data: [{ ok: true, uuid: item.id, available: 1, requestedQuantity: 1 }],
      });

      const result = await caller.checkoutItems({
        studentId: studentInfo.studentId,
        itemIds: [item.id],
      });

      expect(result.ok).toBe(true);
      expect(vi.mocked(checkoutUtils.itemCheckout)).toHaveBeenCalledWith(
        dbUser.id,
        [{ itemId: item.id, quantity: 1 }],
      );
    });

    it("throws NOT_FOUND when student has no account", async () => {
      const studentInfo = makeStudentInfo();
      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.checkoutItems({
          studentId: studentInfo.studentId,
          itemIds: [faker.string.uuid()],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("propagates itemCheckout failures", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(checkoutUtils.itemCheckout).mockResolvedValueOnce({
        ok: false,
        failures: "Item already on loan",
      });

      const result = await caller.checkoutItems({
        studentId: studentInfo.studentId,
        itemIds: [faker.string.uuid()],
      });

      expect(result.ok).toBe(false);
    });

    it("passes multiple item IDs correctly", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });
      const itemIds = [
        faker.string.uuid(),
        faker.string.uuid(),
        faker.string.uuid(),
      ];

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(checkoutUtils.itemCheckout).mockResolvedValueOnce({
        ok: true,
        data: itemIds.map((id) => ({
          ok: true,
          uuid: id,
          available: 1,
          requestedQuantity: 1,
        })),
      });

      await caller.checkoutItems({ studentId: studentInfo.studentId, itemIds });

      const checkoutCall = vi.mocked(checkoutUtils.itemCheckout).mock.calls[0]!;
      expect(checkoutCall[1]).toHaveLength(3);
      expect(checkoutCall[1]).toEqual(
        itemIds.map((id) => ({ itemId: id, quantity: 1 })),
      );
    });
  });

  describe("getUserLoanedItems", () => {
    it("returns loaned items for valid student", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });
      const loanedItem = createLoanedAsset(dbUser);

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      prismaMock.itemRecord.findMany.mockResolvedValueOnce([
        {
          id: faker.string.uuid(),
          itemId: loanedItem.id,
          createdAt: new Date(),
          item: {
            id: loanedItem.id,
            name: loanedItem.name,
            serial: loanedItem.serial,
          },
        },
      ] as never);

      const result = await caller.getUserLoanedItems({
        studentId: studentInfo.studentId,
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.itemId).toBe(loanedItem.id);
    });

    it("throws NOT_FOUND when student has no account", async () => {
      const studentInfo = makeStudentInfo();
      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.getUserLoanedItems({ studentId: studentInfo.studentId }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("queries by userId with loaned=true filter", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      prismaMock.itemRecord.findMany.mockResolvedValueOnce([] as never);

      await caller.getUserLoanedItems({ studentId: studentInfo.studentId });

      expect(prismaMock.itemRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actionByUserId: dbUser.id,
            loaned: true,
          }),
        }),
      );
    });

    it("returns empty array when no items loaned", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      prismaMock.itemRecord.findMany.mockResolvedValueOnce([] as never);

      const result = await caller.getUserLoanedItems({
        studentId: studentInfo.studentId,
      });

      expect(result).toEqual([]);
    });
  });

  describe("checkinItems", () => {
    it("calls itemCheckin with user ID and item IDs", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });
      const itemId = faker.string.uuid();

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(checkinUtils.itemCheckin).mockResolvedValueOnce({
        ok: true,
        data: [{ ok: true, uuid: itemId, quantity: 1 }],
      });

      const result = await caller.checkinItems({
        studentId: studentInfo.studentId,
        itemIds: [itemId],
      });

      expect(result.ok).toBe(true);
      expect(vi.mocked(checkinUtils.itemCheckin)).toHaveBeenCalledWith(
        dbUser.id,
        [{ itemId, quantity: 1 }],
      );
    });

    it("throws NOT_FOUND when student has no account", async () => {
      const studentInfo = makeStudentInfo();
      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);

      await expect(
        caller.checkinItems({
          studentId: studentInfo.studentId,
          itemIds: [faker.string.uuid()],
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("propagates itemCheckin failures", async () => {
      const studentInfo = makeStudentInfo();
      const dbUser = createUser({ email: studentInfo.email });

      vi.mocked(externalApi.getStudentInfo).mockResolvedValueOnce(studentInfo);
      prismaMock.user.findFirst.mockResolvedValueOnce(dbUser);
      vi.mocked(checkinUtils.itemCheckin).mockResolvedValueOnce({
        ok: false,
        failures: "Item is not loaned out",
      });

      const result = await caller.checkinItems({
        studentId: studentInfo.studentId,
        itemIds: [faker.string.uuid()],
      });

      expect(result.ok).toBe(false);
    });
  });

  describe("getAfterHoursOptions", () => {
    it("returns durations and reasons arrays", async () => {
      const result = await caller.getAfterHoursOptions();
      expect(result.durations.length).toBeGreaterThan(0);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("includes '1 hour' in durations", async () => {
      const result = await caller.getAfterHoursOptions();
      expect(result.durations).toContain("1 hour");
    });

    it("includes 'Project work' in reasons", async () => {
      const result = await caller.getAfterHoursOptions();
      expect(result.reasons).toContain("Project work");
    });
  });

  describe("getSupervisors", () => {
    it("returns list of users with id and name", async () => {
      const users = [
        { id: faker.string.uuid(), name: "Alice" },
        { id: faker.string.uuid(), name: "Bob" },
      ];
      prismaMock.user.findMany.mockResolvedValueOnce(users as never);

      const result = await caller.getSupervisors();

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
    });

    it("returns empty array when no users exist", async () => {
      prismaMock.user.findMany.mockResolvedValueOnce([] as never);
      const result = await caller.getSupervisors();
      expect(result).toEqual([]);
    });
  });
});
