// ─── Inventory System Metrics Collector ──────────────────────────────────────
// Queries Prisma for inventory statistics and emits Prometheus gauges.

import { prisma } from "@/server/lib/prisma";
import { formatGauge, formatGaugeSingle } from "./format";

export async function collectInventoryMetrics(): Promise<string> {
  const [
    itemsTotal,
    itemsStored,
    itemsLoaned,
    consumableAgg,
    locationsTotal,
    tagsTotal,
    usersTotal,
    usersBanned,
    groupsTotal,
    recordsTotal,
    printersByType,
    jobsByStatus,
  ] = await Promise.all([
    prisma.item.count({ where: { deleted: false } }),
    prisma.item.count({ where: { deleted: false, stored: true } }),
    prisma.item.count({ where: { deleted: false, stored: false } }),
    prisma.consumable.aggregate({ _sum: { total: true, available: true } }),
    prisma.location.count(),
    prisma.tag.count(),
    prisma.user.count(),
    prisma.user.count({ where: { banned: true } }),
    prisma.group.count(),
    prisma.itemRecord.count(),
    prisma.printer.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.gcodePrintJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const lines: string[] = [];

  lines.push(
    formatGaugeSingle(
      "inventory_items_total",
      "Total number of non-deleted items in the inventory",
      itemsTotal,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_items_stored",
      "Number of items currently stored (not loaned out)",
      itemsStored,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_items_loaned",
      "Number of items currently on loan",
      itemsLoaned,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_consumables_total",
      "Total consumable quantity across all consumable items",
      consumableAgg._sum.total ?? 0,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_consumables_available",
      "Available consumable quantity across all consumable items",
      consumableAgg._sum.available ?? 0,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_locations_total",
      "Total number of locations",
      locationsTotal,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_tags_total",
      "Total number of tags",
      tagsTotal,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_users_total",
      "Total number of users",
      usersTotal,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_users_banned",
      "Number of banned users",
      usersBanned,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_groups_total",
      "Total number of groups",
      groupsTotal,
    ),
  );
  lines.push(
    formatGaugeSingle(
      "inventory_records_total",
      "Total number of item transaction records",
      recordsTotal,
    ),
  );

  // Printers by type — single HELP/TYPE header, multiple samples
  const printerTypes = ["PRUSA", "BAMBU"] as const;
  lines.push(
    formatGauge(
      "inventory_printers_total",
      "Total number of registered printers",
      printerTypes.map((type) => ({
        value: printersByType.find((p) => p.type === type)?._count._all ?? 0,
        labels: { type },
      })),
    ),
  );

  // Print jobs by status — single HELP/TYPE header, multiple samples
  const jobStatuses = ["STORED", "DISPATCHED", "DISPATCH_FAILED"] as const;
  lines.push(
    formatGauge(
      "inventory_print_jobs_total",
      "Total number of gcode print jobs",
      jobStatuses.map((status) => ({
        value: jobsByStatus.find((j) => j.status === status)?._count._all ?? 0,
        labels: { status },
      })),
    ),
  );

  return lines.join("\n");
}
