import { trpc } from "@/client/trpc";
import { AlertTriangle, WifiOff, Wrench } from "lucide-react";
import type { StatusAlert } from "@/server/api/routers/status";

type AlertType = StatusAlert["type"];

const PRIORITY: Record<AlertType, number> = {
  incident: 2,
  downtime: 1,
  maintenance: 0,
};

const STYLES: Record<
  AlertType,
  { banner: string; item: string; label: string; Icon: React.ElementType }
> = {
  incident: {
    banner: "bg-destructive/10 border-destructive/25",
    item: "text-destructive",
    label: "INCIDENT",
    Icon: AlertTriangle,
  },
  downtime: {
    banner: "bg-orange-500/10 border-orange-500/25",
    item: "text-orange-600 dark:text-orange-400",
    label: "OUTAGE",
    Icon: WifiOff,
  },
  maintenance: {
    banner: "bg-blue-500/10 border-blue-500/25",
    item: "text-blue-600 dark:text-blue-400",
    label: "MAINTENANCE",
    Icon: Wrench,
  },
};

function AlertItem({
  alert,
  ariaHidden,
}: {
  alert: StatusAlert;
  ariaHidden?: boolean;
}) {
  const { Icon, item, label } = STYLES[alert.type];
  return (
    <span
      aria-hidden={ariaHidden}
      className={`inline-flex items-center gap-2 px-10 text-sm font-medium ${item}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs font-bold uppercase tracking-wider opacity-70">
        {label}
      </span>
      <span>{alert.label}</span>
    </span>
  );
}

export function OutageBanner() {
  const { data } = trpc.status.outages.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });

  const alerts = data?.alerts ?? [];
  if (alerts.length === 0) return null;

  const dominantType = alerts.reduce<AlertType>(
    (acc, a) => (PRIORITY[a.type] > PRIORITY[acc] ? a.type : acc),
    alerts[0]!.type,
  );

  const { banner } = STYLES[dominantType];
  const bannerClass = `w-full border-b py-2.5 ${banner}`;

  if (alerts.length === 1) {
    const { Icon, item, label } = STYLES[alerts[0]!.type];
    return (
      <div className={bannerClass}>
        <div
          className={`flex items-center justify-center gap-2 text-sm font-medium px-4 ${item}`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider opacity-70">
            {label}
          </span>
          <span>{alerts[0]!.label}</span>
        </div>
      </div>
    );
  }

  // Each half must exceed the widest viewport (~5120px) for seamless looping.
  // Conservative estimate: 260px per item (short text + padding + icon + badge).
  const EST_ITEM_PX = 260;
  const MIN_HALF_PX = 5200;
  const repeats = Math.max(
    1,
    Math.ceil(MIN_HALF_PX / (alerts.length * EST_ITEM_PX)),
  );
  const copies = Array(repeats).fill(alerts).flat() as StatusAlert[];
  // Keep speed constant at ~100px/s regardless of content length.
  const durationS = Math.round((copies.length * EST_ITEM_PX) / 100);

  return (
    <div className={`${bannerClass} overflow-hidden`}>
      <div
        className="flex whitespace-nowrap animate-marquee"
        style={{ "--marquee-duration": `${durationS}s` } as React.CSSProperties}
      >
        {[...copies, ...copies].map((alert, i) => (
          <AlertItem key={i} alert={alert} ariaHidden={i >= copies.length} />
        ))}
      </div>
    </div>
  );
}
