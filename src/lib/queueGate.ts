/**
 * Decides whether a print can be queued to a printer, a model or "any
 * printer", given which printers currently have a BLOCKING error. Used by the
 * server (the real check) and by the picker (to grey things out and say why).
 */

export interface GatePrinter {
  id: number;
  name: string;
  model: string | null;
  /** Errors that block, as short descriptions. Empty when the printer is fine. */
  blockingErrors: string[];
}

export type GateTargeting =
  | { mode: "any" }
  | { mode: "model"; model: string }
  | { mode: "printer"; printerId: number };

export interface GateResult {
  allowed: boolean;
  /** Sentence for the user when not allowed. */
  reason?: string;
}

const blocked = (p: GatePrinter) => p.blockingErrors.length > 0;

function describe(p: GatePrinter): string {
  const first = p.blockingErrors[0];
  const more =
    p.blockingErrors.length > 1
      ? ` (+${p.blockingErrors.length - 1} more)`
      : "";
  return `${p.name}: ${first}${more}`;
}

export function evaluateTargeting(
  targeting: GateTargeting,
  printers: GatePrinter[],
): GateResult {
  if (targeting.mode === "printer") {
    const printer = printers.find((p) => p.id === targeting.printerId);
    if (!printer || !blocked(printer)) return { allowed: true };
    return {
      allowed: false,
      reason: `${printer.name} has an error that must be cleared before it can take a new print. ${describe(printer)}`,
    };
  }

  const candidates =
    targeting.mode === "model"
      ? printers.filter((p) => p.model === targeting.model)
      : printers;
  // Nothing to judge (unknown model, no printers): let BamBuddy decide.
  if (candidates.length === 0) return { allowed: true };
  if (!candidates.every(blocked)) return { allowed: true };

  const which =
    targeting.mode === "model"
      ? `Every ${targeting.model} printer`
      : "Every printer";
  return {
    allowed: false,
    reason: `${which} has an error that must be cleared first. ${candidates.map(describe).join("; ")}`,
  };
}

/** For the picker: which printers to grey out, and the reason to show. */
export function blockedPrinterReasons(
  printers: GatePrinter[],
): Map<number, string> {
  return new Map(printers.filter(blocked).map((p) => [p.id, describe(p)]));
}
