import { z } from "zod";
import { prisma } from "./prisma";

const locationRowSchema = z.object({ id: z.string() });
const locationRowsSchema = z.array(locationRowSchema);

/**
 * Returns the given locationId plus all descendant location IDs via recursive CTE.
 * Validated at runtime so schema changes surface as errors rather than silent mismatches.
 */
export async function getLocationTreeIds(
  locationId: string,
): Promise<string[]> {
  const raw = await prisma.$queryRaw`
    WITH RECURSIVE location_tree AS (
      SELECT id FROM "Location" WHERE id = ${locationId}
      UNION ALL
      SELECT l.id FROM "Location" l
      INNER JOIN location_tree lt ON l."parentId" = lt.id
    )
    SELECT id FROM location_tree
  `;

  const rows = locationRowsSchema.parse(raw);
  return rows.map((r) => r.id);
}
