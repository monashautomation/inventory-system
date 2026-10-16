import { prisma } from "@/server/lib/prisma";
import { logger } from "@/server/lib/logger";
import { resolveUsernameToId } from "@/server/lib/tamarin/afterhours";

// Discord webhook that receives one short line per failed print. Inert when
// unset, so the feature is opt-in per deployment (same pattern as the
// after-hours webhook in tamarin/afterhours.ts).
const WEBHOOK_ENV = "PRINT_FAILURES_DISCORD_WEBHOOK";

// Hard cap on the whole message, per the "25 words or less" brief.
export const MAX_WORDS = 25;

// A print that dies this fast after starting almost never fails for a
// print-quality reason — it is a setup/spool/first-layer problem.
const EARLY_ABORT_MS = 2 * 60_000;

export interface FailureSignals {
  status: string;
  printName?: string | null;
  printerName?: string | null;
  username?: string | null;
  createdAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  filamentGrams?: number | null;
  filamentType?: string | null;
  /** Bambuddy's own error string when it recorded one. */
  errorMessage?: string | null;
  /** Bambuddy queue waiting reason, e.g. filament short. */
  waitingReason?: string | null;
  filamentShort?: boolean;
}

export function getPrintFailureWebhook(): string | null {
  const url = process.env[WEBHOOK_ENV]?.trim();
  if (!url) return null;
  return url;
}

/** Trim to the first `max` whitespace-separated words, appending an ellipsis. */
export function capWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return words.join(" ");
  return words.slice(0, max).join(" ") + "…";
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/**
 * Prefer Bambuddy's own error string; otherwise infer the "why" from the
 * signals we capture: whether it ever started, how long it ran, and how much
 * filament it got through.
 */
export function diagnoseFailure(s: FailureSignals): string {
  if (s.errorMessage?.trim()) return s.errorMessage.trim();

  if (s.filamentShort)
    return "filament ran short before the print could finish";

  if (s.status === "missed") {
    return "never reached the printer — vanished from the queue before capture";
  }

  const started = s.startedAt ? s.startedAt.getTime() : null;

  if (started === null) {
    const reason = s.waitingReason?.trim();
    return reason
      ? `never started — Bambuddy held it: ${reason}`
      : "never started — dispatch, slice or spool setup likely failed";
  }

  const endMs =
    s.completedAt?.getTime() ?? s.createdAt?.getTime() ?? Date.now();
  const ranMs = Math.max(0, endMs - started);

  if (ranMs < EARLY_ABORT_MS) {
    return `aborted ${formatDuration(ranMs)} in — check spool, bed adhesion, nozzle`;
  }

  const grams =
    s.filamentGrams != null && s.filamentGrams > 0
      ? ` after ${Math.round(s.filamentGrams)}g of filament`
      : "";
  return `stopped ${formatDuration(ranMs)} in${grams} — interrupted partway through`;
}

/** One compact line: printer · file · who · material · what happened. */
export function buildFailureMessage(s: FailureSignals): string {
  const head = [
    s.printerName ?? "printer",
    s.printName ?? "unnamed print",
    s.username ?? "unknown user",
  ];
  if (s.filamentType) {
    head.push(
      s.filamentGrams != null && s.filamentGrams > 0
        ? `${s.filamentType} ${Math.round(s.filamentGrams)}g`
        : s.filamentType,
    );
  }
  return capWords(`🖨 ${head.join(" · ")} — ${diagnoseFailure(s)}`, MAX_WORDS);
}

/**
 * Look the submission up and post the failure line. Called from the queue
 * poller at the exact moment a submission flips to a terminal failure state,
 * so each failure notifies once. Never throws — notification is best-effort.
 */
export async function notifyPrintFailure(
  submissionId: string,
  status: string,
  signals: Omit<FailureSignals, "status">,
): Promise<boolean> {
  const webhookUrl = getPrintFailureWebhook();
  if (!webhookUrl) return false;

  try {
    const submission = await prisma.printQueueSubmission.findUnique({
      where: { id: submissionId },
      select: { user: { select: { discordId: true, name: true } } },
    });

    const username = submission?.user?.name ?? signals.username ?? null;

    // discordId is a snowflake only when it is all digits; member records
    // store usernames, so fall back to the guild member search the
    // after-hours flow already uses.
    const stored = submission?.user?.discordId ?? null;
    let discordId: string | null =
      stored && /^\d{15,25}$/.test(stored) ? stored : null;
    if (!discordId && username) {
      const botToken = process.env.AFTER_HOURS_BOT_TOKEN?.trim();
      const guildId = process.env.AFTER_HOURS_GUILD_ID?.trim();
      if (botToken && guildId) {
        discordId = await resolveUsernameToId(botToken, guildId, username);
      }
    }
    const mention = discordId ? `<@${discordId}>` : null;

    // the mention token counts as a word against the cap
    const message = capWords(
      buildFailureMessage({ ...signals, status, username }),
      mention ? MAX_WORDS - 1 : MAX_WORDS,
    );

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: mention ? `${mention} ${message}` : message,
        allowed_mentions: { users: discordId ? [discordId] : [] },
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        {
          submissionId,
          status,
          discordStatus: res.status,
          text: text.slice(0, 200),
        },
        "Print failure webhook rejected",
      );
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(
      { err, submissionId, status },
      "Print failure notification failed",
    );
    return false;
  }
}
