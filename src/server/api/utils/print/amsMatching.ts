import type { AMSUnit } from "@/server/lib/bambuddy";

export interface AmsSlot {
  flatIndex: number;
  amsId: number;
  trayId: number;
  trayType: string | null;
  trayColor: string | null;
  trayIdName: string | null;
  traySubBrands: string | null;
  remain: number;
}

export interface FilamentConstraint {
  slotIndex: number;
  type?: string | null;
  colorHex?: string | null;
  colorName?: string | null;
}

export interface SlotMatch {
  slotIndex: number;
  matched: boolean;
  slot: AmsSlot | null;
}

/** Flatten all AMS units into ordered slot list. Flat index = ams_id * 4 + tray_id. */
export function buildAmsSlots(amsUnits: AMSUnit[]): AmsSlot[] {
  return amsUnits.flatMap((unit) =>
    unit.tray.map((tray) => ({
      flatIndex: unit.id * 4 + tray.id,
      amsId: unit.id,
      trayId: tray.id,
      trayType: tray.tray_type ?? null,
      trayColor: tray.tray_color ?? null,
      trayIdName: tray.tray_id_name ?? null,
      traySubBrands: tray.tray_sub_brands ?? null,
      remain: tray.remain,
    })),
  );
}

function rgbHex(color: string): string {
  return color.slice(0, 6).toUpperCase();
}

function colorMatches(
  slotColor: string | null,
  constraintColor: string,
): boolean {
  if (!slotColor) return false;
  return rgbHex(slotColor) === rgbHex(constraintColor);
}

function typeMatches(slotType: string | null, constraintType: string): boolean {
  if (!slotType) return false;
  const a = slotType.toUpperCase();
  const b = constraintType.toUpperCase();
  return a === b || a.startsWith(b + " ") || b.startsWith(a + " ");
}

/**
 * Match each constrained filament slot to the best available AMS tray.
 * Picks the tray with most remain among matches.
 */
export function matchFilaments(
  constraints: FilamentConstraint[],
  slots: AmsSlot[],
): SlotMatch[] {
  return constraints.map((constraint) => {
    const candidates = slots.filter((slot) => {
      if (slot.remain <= 0) return false;
      if (constraint.type && !typeMatches(slot.trayType, constraint.type))
        return false;
      if (
        constraint.colorHex &&
        !colorMatches(slot.trayColor, constraint.colorHex)
      )
        return false;
      return true;
    });

    if (candidates.length === 0) {
      return { slotIndex: constraint.slotIndex, matched: false, slot: null };
    }

    const best = candidates.reduce((a, b) => (a.remain >= b.remain ? a : b));
    return { slotIndex: constraint.slotIndex, matched: true, slot: best };
  });
}

/**
 * Build the ams_mapping array for BambuDdy.
 * Returns null if any required slot could not be matched.
 */
export function buildAmsMapping(
  totalSlots: number,
  matches: SlotMatch[],
): { mapping: number[] | null; unmatched: number[] } {
  const mapping = new Array<number>(totalSlots).fill(-1);
  const unmatched: number[] = [];

  for (const match of matches) {
    if (!match.matched || !match.slot) {
      unmatched.push(match.slotIndex);
    } else {
      mapping[match.slotIndex] = match.slot.flatIndex;
    }
  }

  return {
    mapping: unmatched.length === 0 ? mapping : null,
    unmatched,
  };
}
