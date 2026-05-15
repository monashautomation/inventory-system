import { describe, it, vi, expect, afterEach, beforeEach } from "vitest";

// Must mock fetch before importing the module under test
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Must mock console before import too
// eslint-disable-next-line @typescript-eslint/no-empty-function
const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

import { getStudentInfo, postDiscordMessage } from "@/server/lib/external-api";

beforeEach(() => {
  delete process.env.STUDENT_API_BASE;
  delete process.env.STUDENT_API_KEY;
});

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.STUDENT_API_BASE;
  delete process.env.STUDENT_API_KEY;
});

describe("getStudentInfo", () => {
  describe("stub mode (no STUDENT_API_BASE)", () => {
    it("returns mock data with provided studentId", async () => {
      const result = await getStudentInfo("12345678");

      expect(result.studentId).toBe("12345678");
      expect(result.name).toBeDefined();
      expect(result.email).toBeDefined();
      expect(result.discordId).toBeDefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("preserves studentId in returned stub data", async () => {
      const studentId = "99887766";
      const result = await getStudentInfo(studentId);
      expect(result.studentId).toBe(studentId);
    });
  });

  describe("real API mode (STUDENT_API_BASE set)", () => {
    it("calls API with correct URL and auth header", async () => {
      process.env.STUDENT_API_BASE = "https://api.example.com";
      process.env.STUDENT_API_KEY = "test-key";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          studentId: "12345678",
          name: "Jane Smith",
          email: "jane@student.monash.edu",
          discordId: "111222333",
        }),
      });

      const result = await getStudentInfo("12345678");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.example.com/members/12345678",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
      expect(result.name).toBe("Jane Smith");
      expect(result.studentId).toBe("12345678");
    });

    it("throws on non-OK response", async () => {
      process.env.STUDENT_API_BASE = "https://api.example.com";

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(getStudentInfo("00000000")).rejects.toThrow(
        "Member not found",
      );
    });

    it("attaches studentId to API response even if missing from payload", async () => {
      process.env.STUDENT_API_BASE = "https://api.example.com";

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => ({
          name: "No ID Student",
          email: "noid@student.monash.edu",
          discordId: "999",
        }),
      });

      const result = await getStudentInfo("42424242");
      expect(result.studentId).toBe("42424242");
    });
  });
});

describe("postDiscordMessage", () => {
  describe("stub mode (no DISCORD_API_BASE)", () => {
    it("logs to console instead of calling API", async () => {
      await postDiscordMessage({
        channel: "test-channel",
        text: "hello",
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Discord stub] channel:",
        "test-channel",
      );
      expect(consoleSpy).toHaveBeenCalledWith("[Discord stub] text:", "hello");
    });

    it("resolves without error", async () => {
      await expect(
        postDiscordMessage({ channel: "any", text: "any" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("real API mode (STUDENT_API_BASE set)", () => {
    it("POSTs to correct URL with correct payload", async () => {
      process.env.STUDENT_API_BASE = "https://discord-api.example.com";
      process.env.STUDENT_API_KEY = "discord-key";

      fetchMock.mockResolvedValueOnce({ ok: true });

      await postDiscordMessage({
        channel: "after-hours",
        text: "test message",
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://discord-api.example.com/afterhours",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer discord-key",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ message: "test message" }),
        }),
      );
    });

    it("throws on non-OK response", async () => {
      process.env.STUDENT_API_BASE = "https://discord-api.example.com";

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(
        postDiscordMessage({ channel: "ch", text: "txt" }),
      ).rejects.toThrow("Discord API error: 500 Internal Server Error");
    });
  });
});
