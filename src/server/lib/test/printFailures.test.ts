import { describe, it, vi, expect, beforeEach, afterEach } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import {
  buildFailureMessage,
  capWords,
  diagnoseFailure,
  notifyPrintFailure,
  MAX_WORDS,
} from "@/server/lib/printFailures";
import prismaMock from "@/server/lib/__mocks__/prisma";

const WEBHOOK = "https://discord.com/api/webhooks/test/print-failures";

function setEnv() {
  process.env.PRINT_FAILURES_DISCORD_WEBHOOK = WEBHOOK;
}
function clearEnv() {
  delete process.env.PRINT_FAILURES_DISCORD_WEBHOOK;
  delete process.env.AFTER_HOURS_BOT_TOKEN;
  delete process.env.AFTER_HOURS_GUILD_ID;
}

beforeEach(() => {
  fetchMock.mockReset();
  clearEnv();
});
afterEach(clearEnv);

describe("capWords", () => {
  it("leaves short text alone", () => {
    expect(capWords("one two three", 25)).toBe("one two three");
  });

  it("truncates to the word cap with an ellipsis", () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const out = capWords(long, MAX_WORDS);
    // ellipsis is glued to the last word, so the count stays at the cap
    expect(out.split(/\s+/)).toHaveLength(MAX_WORDS);
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith("w0 w1")).toBe(true);
  });

  it("collapses runs of whitespace", () => {
    expect(capWords("  a \n\n  b\tc  ", 25)).toBe("a b c");
  });
});

describe("diagnoseFailure", () => {
  it("prefers Bambuddy's own error message", () => {
    expect(
      diagnoseFailure({
        status: "failed",
        errorMessage: "Nozzle temperature too high",
        startedAt: new Date("2026-10-15T02:00:00Z"),
        completedAt: new Date("2026-10-15T02:30:00Z"),
      }),
    ).toBe("Nozzle temperature too high");
  });

  it("reports filament shortage", () => {
    expect(
      diagnoseFailure({ status: "failed", filamentShort: true }),
    ).toContain("filament ran short");
  });

  it("explains missed prints", () => {
    expect(diagnoseFailure({ status: "missed" })).toContain(
      "never reached the printer",
    );
  });

  it("uses the Bambuddy waiting reason when it never started", () => {
    expect(
      diagnoseFailure({
        status: "failed",
        waitingReason: "AMS filament empty",
      }),
    ).toBe("never started — Bambuddy held it: AMS filament empty");
  });

  it("flags very early aborts as setup problems", () => {
    const out = diagnoseFailure({
      status: "failed",
      startedAt: new Date("2026-10-15T02:00:00Z"),
      completedAt: new Date("2026-10-15T02:00:40Z"),
    });
    expect(out).toContain("aborted 40s in");
    expect(out).toContain("bed adhesion");
  });

  it("reports mid-print stops with filament used", () => {
    const out = diagnoseFailure({
      status: "failed",
      startedAt: new Date("2026-10-15T02:00:00Z"),
      completedAt: new Date("2026-10-15T02:30:00Z"),
      filamentGrams: 18.4,
    });
    expect(out).toContain("stopped 30m in");
    expect(out).toContain("18g of filament");
  });
});

describe("buildFailureMessage", () => {
  it("stays within the word cap", () => {
    const msg = buildFailureMessage({
      status: "failed",
      printName: "Neil-Gu_Personal_Compression-member-large-2",
      printerName: "PRNT011",
      username: "Neil Gu",
      filamentType: "PLA",
      filamentGrams: 18.19,
      startedAt: new Date("2026-10-15T02:43:48Z"),
      completedAt: new Date("2026-10-15T02:56:51Z"),
    });
    const words = msg.split(/\s+/).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(MAX_WORDS);
    expect(msg).toContain("PRNT011");
    expect(msg).toContain("Neil Gu");
  });

  it("leads with the Bambuddy error when present", () => {
    const msg = buildFailureMessage({
      status: "failed",
      printerName: "PRNT007",
      username: "Emil Haila",
      errorMessage: "Filament runout sensor triggered",
    });
    expect(msg).toContain("Filament runout sensor triggered");
    expect(msg).toContain("Emil Haila");
  });
});

describe("notifyPrintFailure", () => {
  it("is inert without a webhook configured", async () => {
    const ok = await notifyPrintFailure("sub-1", "failed", {});
    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one line and mentions the resolved discord user", async () => {
    setEnv();
    process.env.AFTER_HOURS_BOT_TOKEN = "bot-token";
    process.env.AFTER_HOURS_GUILD_ID = "guild-id";

    prismaMock.printQueueSubmission.findUnique.mockResolvedValue({
      user: { discordId: "prtcl3", name: "Neil Gu" },
    } as never);

    // first fetch: guild member search resolves "Neil Gu" → snowflake
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            {
              nick: "Neil Gu",
              user: { id: "999000111222333444", username: "neilgu" },
            },
          ]),
      } as Response)
      .mockResolvedValueOnce({ ok: true, status: 200 } as Response);

    const ok = await notifyPrintFailure("sub-1", "failed", {
      printName: "bracket",
      printerName: "PRNT011",
      filamentType: "PLA",
      filamentGrams: 12,
      startedAt: new Date("2026-10-15T02:00:00Z"),
      completedAt: new Date("2026-10-15T02:20:00Z"),
    });

    expect(ok).toBe(true);
    // call 1 = guild member search, call 2 = the webhook post
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(WEBHOOK);
    const body = JSON.parse(init.body as string);
    expect(body.content).toContain("<@999000111222333444>");
    expect(body.allowed_mentions.users).toEqual(["999000111222333444"]);
    expect(body.content.split(/\s+/).length).toBeLessThanOrEqual(MAX_WORDS + 1);
  });

  it("posts without a mention when the user cannot be resolved", async () => {
    setEnv();

    prismaMock.printQueueSubmission.findUnique.mockResolvedValue({
      user: { discordId: null, name: "Nobody Here" },
    } as never);

    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

    const ok = await notifyPrintFailure("sub-2", "missed", {});

    expect(ok).toBe(true);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.content).not.toContain("<@");
    expect(body.allowed_mentions.users).toEqual([]);
    expect(body.content).toContain("Nobody Here");
  });

  it("returns false and never throws when the webhook rejects", async () => {
    setEnv();
    prismaMock.printQueueSubmission.findUnique.mockResolvedValue({
      user: { discordId: null, name: "X" },
    } as never);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("bad webhook"),
    } as Response);

    await expect(notifyPrintFailure("sub-3", "failed", {})).resolves.toBe(
      false,
    );
  });

  it("returns false when the lookup blows up", async () => {
    setEnv();
    prismaMock.printQueueSubmission.findUnique.mockRejectedValue(
      new Error("db down"),
    );

    await expect(notifyPrintFailure("sub-4", "failed", {})).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
