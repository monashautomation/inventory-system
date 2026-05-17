import { describe, it, expect } from "vitest";
import {
  buildAmsSlots,
  matchFilaments,
  buildAmsMapping,
  type FilamentConstraint,
} from "../amsMatching";
import type { AMSUnit } from "@/server/lib/bambuddy";

const makeAms = (
  units: {
    id: number;
    trays: { id: number; type: string; color: string; remain: number }[];
  }[],
): AMSUnit[] =>
  units.map((u) => ({
    id: u.id,
    humidity: null,
    temp: null,
    is_ams_ht: false,
    serial_number: "",
    sw_ver: "",
    dry_time: 0,
    dry_status: 0,
    dry_sub_status: 0,
    dry_sf_reason: [],
    module_type: "",
    tray: u.trays.map((t) => ({
      id: t.id,
      tray_color: t.color,
      tray_type: t.type,
      tray_sub_brands: null,
      tray_id_name: null,
      tray_info_idx: null,
      remain: t.remain,
      k: null,
      cali_idx: null,
      tag_uid: null,
      tray_uuid: null,
      nozzle_temp_min: null,
      nozzle_temp_max: null,
      drying_temp: null,
      drying_time: null,
      state: null,
    })),
  }));

describe("buildAmsSlots", () => {
  it("flattens multiple AMS units into ordered slot list", () => {
    const ams = makeAms([
      {
        id: 0,
        trays: [
          { id: 0, type: "PLA", color: "FF0000FF", remain: 80 },
          { id: 1, type: "PETG", color: "00FF00FF", remain: 60 },
        ],
      },
      { id: 1, trays: [{ id: 0, type: "ABS", color: "0000FFFF", remain: 40 }] },
    ]);
    const slots = buildAmsSlots(ams);
    expect(slots).toHaveLength(3);
    expect(slots[0]).toMatchObject({
      amsId: 0,
      trayId: 0,
      flatIndex: 0,
      trayType: "PLA",
    });
    expect(slots[1]).toMatchObject({
      amsId: 0,
      trayId: 1,
      flatIndex: 1,
      trayType: "PETG",
    });
    expect(slots[2]).toMatchObject({
      amsId: 1,
      trayId: 0,
      flatIndex: 4,
      trayType: "ABS",
    });
  });
});

describe("matchFilaments", () => {
  const ams = makeAms([
    {
      id: 0,
      trays: [
        { id: 0, type: "PLA", color: "FF0000FF", remain: 80 },
        { id: 1, type: "PLA", color: "00FF00FF", remain: 50 },
        { id: 2, type: "PETG", color: "0000FFFF", remain: 70 },
        { id: 3, type: "ABS", color: "FFFFFFFF", remain: 0 },
      ],
    },
  ]);
  const slots = buildAmsSlots(ams);

  it("matches by type, picking highest remain", () => {
    const constraints: FilamentConstraint[] = [{ slotIndex: 0, type: "PLA" }];
    const result = matchFilaments(constraints, slots);
    expect(result[0].matched).toBe(true);
    expect(result[0].slot?.flatIndex).toBe(0); // 80% > 50%
  });

  it("matches by color", () => {
    const constraints: FilamentConstraint[] = [
      { slotIndex: 0, colorHex: "0000FFFF" },
    ];
    const result = matchFilaments(constraints, slots);
    expect(result[0].matched).toBe(true);
    expect(result[0].slot?.trayType).toBe("PETG");
  });

  it("skips trays with 0% remain", () => {
    const constraints: FilamentConstraint[] = [{ slotIndex: 0, type: "ABS" }];
    const result = matchFilaments(constraints, slots);
    expect(result[0].matched).toBe(false);
  });

  it("returns unmatched when no tray fits", () => {
    const constraints: FilamentConstraint[] = [{ slotIndex: 0, type: "TPU" }];
    const result = matchFilaments(constraints, slots);
    expect(result[0].matched).toBe(false);
    expect(result[0].slot).toBeNull();
  });
});

describe("buildAmsMapping", () => {
  it("builds correct mapping array from matches", () => {
    const matches = [
      {
        slotIndex: 0,
        matched: true,
        slot: {
          flatIndex: 2,
          amsId: 0,
          trayId: 2,
          trayType: "PETG",
          trayColor: null,
          trayIdName: null,
          traySubBrands: null,
          remain: 70,
        },
      },
      {
        slotIndex: 1,
        matched: true,
        slot: {
          flatIndex: 0,
          amsId: 0,
          trayId: 0,
          trayType: "PLA",
          trayColor: null,
          trayIdName: null,
          traySubBrands: null,
          remain: 80,
        },
      },
    ];
    const { mapping, unmatched } = buildAmsMapping(2, matches);
    expect(mapping).toEqual([2, 0]);
    expect(unmatched).toHaveLength(0);
  });

  it("returns null mapping when any slot unmatched", () => {
    const matches = [
      { slotIndex: 0, matched: false, slot: null },
      {
        slotIndex: 1,
        matched: true,
        slot: {
          flatIndex: 0,
          amsId: 0,
          trayId: 0,
          trayType: "PLA",
          trayColor: null,
          trayIdName: null,
          traySubBrands: null,
          remain: 80,
        },
      },
    ];
    const { mapping, unmatched } = buildAmsMapping(2, matches);
    expect(mapping).toBeNull();
    expect(unmatched).toEqual([0]);
  });
});
