import { router, publicProcedure } from "@/server/trpc";
import { z } from "zod";

const monitorSchema = z.object({
  id: z.number(),
  name: z.string(),
  sendUrl: z.number(),
  type: z.string(),
});

const statusPageSchema = z.object({
  incidents: z.array(
    z.object({
      id: z.number().optional(),
      title: z.string(),
      content: z.string(),
      style: z.string().optional(),
    }),
  ),
  publicGroupList: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      weight: z.number(),
      monitorList: z.array(monitorSchema),
    }),
  ),
  maintenanceList: z.array(z.unknown()),
});

const heartbeatListSchema = z.object({
  heartbeatList: z.record(
    z.string(),
    z.array(
      z.object({
        status: z.number(),
        time: z.string(),
        msg: z.string(),
        ping: z.number().nullable(),
      }),
    ),
  ),
});

const alertSchema = z.object({
  type: z.enum(["incident", "downtime", "maintenance"]),
  label: z.string(),
});

export type StatusAlert = z.infer<typeof alertSchema>;

export const statusRouter = router({
  outages: publicProcedure
    .output(
      z.object({
        alerts: z.array(alertSchema),
        statusUrl: z.string().nullable(),
      }),
    )
    .query(async () => {
      const base = process.env.UPTIME_KUMA_BASE;
      const page = process.env.UPTIME_KUMA_PAGE;
      const statusUrl = process.env.UPTIME_KUMA_USER_LINK ?? null;

      if (!base || !page) return { alerts: [], statusUrl };

      const prefix = base.startsWith("http") ? "" : "http://";
      const apiStatusUrl = `${prefix}${base}/api/status-page/${page}`;
      const heartbeatUrl = `${prefix}${base}/api/status-page/heartbeat/${page}`;

      try {
        const [statusRes, heartbeatRes] = await Promise.all([
          fetch(apiStatusUrl, { signal: AbortSignal.timeout(5000) }),
          fetch(heartbeatUrl, { signal: AbortSignal.timeout(5000) }),
        ]);

        if (!statusRes.ok || !heartbeatRes.ok) return { alerts: [], statusUrl };

        const [statusJson, heartbeatJson] = await Promise.all([
          statusRes.json(),
          heartbeatRes.json(),
        ]);

        const statusParsed = statusPageSchema.safeParse(statusJson);
        const heartbeatParsed = heartbeatListSchema.safeParse(heartbeatJson);

        if (!statusParsed.success || !heartbeatParsed.success) {
          return { alerts: [], statusUrl };
        }

        const { incidents, publicGroupList, maintenanceList } =
          statusParsed.data;
        const { heartbeatList } = heartbeatParsed.data;

        const monitorNames = new Map<number, string>();
        for (const group of publicGroupList) {
          for (const monitor of group.monitorList) {
            monitorNames.set(monitor.id, monitor.name);
          }
        }

        const alerts: StatusAlert[] = [];

        for (const inc of incidents) {
          alerts.push({ type: "incident", label: inc.title });
        }

        for (const [idStr, beats] of Object.entries(heartbeatList)) {
          if (beats.length === 0) continue;
          const latest = beats[beats.length - 1];
          if (latest.status !== 0) continue;
          const name = monitorNames.get(Number(idStr)) ?? `Monitor #${idStr}`;
          alerts.push({ type: "downtime", label: `${name} is down` });
        }

        for (const maint of maintenanceList) {
          const m = maint as { title?: string };
          if (m?.title) alerts.push({ type: "maintenance", label: m.title });
        }

        return { alerts, statusUrl };
      } catch {
        return { alerts: [], statusUrl };
      }
    }),
});
