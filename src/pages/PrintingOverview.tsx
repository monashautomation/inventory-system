import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ListOrdered, Monitor, Printer, Video } from "lucide-react";
import { trpc } from "@/client/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/printing/PageHeader";
import { PRINTING_ROUTES } from "@/lib/printingRoutes";
import printingLogo from "@/assets/ma-3d-print.svg";

const BUSY_STATES = ["PRINTING", "PAUSED", "BUSY"];
const READY_STATES = ["IDLE", "READY", "FINISHED"];
const PROBLEM_STATES = ["ATTENTION", "UNREACHABLE"];

function dotColor(state: string): string {
  const s = state.toUpperCase();
  if (BUSY_STATES.includes(s)) return "bg-yellow-500";
  if (PROBLEM_STATES.includes(s)) return "bg-red-500";
  if (READY_STATES.includes(s)) return "bg-green-500";
  return "bg-muted-foreground";
}

const quickActions = [
  {
    title: "Queue a 3MF",
    description: "Add a Bambu job to the queue",
    url: `${PRINTING_ROUTES.queue}?open=upload`,
    icon: ListOrdered,
  },
  {
    title: "Send G-code",
    description: "Upload and print straight to a printer",
    url: PRINTING_ROUTES.send,
    icon: Printer,
  },
  {
    title: "Monitor",
    description: "Full telemetry and controls",
    url: PRINTING_ROUTES.monitor,
    icon: Monitor,
  },
  {
    title: "Cameras",
    description: "Live webcam wall",
    url: PRINTING_ROUTES.cameras,
    icon: Video,
  },
];

export default function PrintingOverview() {
  const statusQuery = trpc.print.getLivePrinterStatuses.useQuery(undefined, {
    refetchInterval: 10_000,
  });

  const printers = useMemo(
    () =>
      [...(statusQuery.data ?? [])].sort(
        (a, b) =>
          a.printerType.localeCompare(b.printerType) ||
          a.printerName.localeCompare(b.printerName),
      ),
    [statusQuery.data],
  );

  const counts = useMemo(() => {
    const upper = printers.map((p) => p.state.toUpperCase());
    return {
      printing: upper.filter((s) => BUSY_STATES.includes(s)).length,
      ready: upper.filter((s) => READY_STATES.includes(s)).length,
      problem: upper.filter((s) => PROBLEM_STATES.includes(s)).length,
    };
  }, [printers]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-4">
        <img
          src={printingLogo}
          alt=""
          className="h-14 w-14 shrink-0 rounded-[28%] shadow-sm"
        />
        <PageHeader
          title="Printing"
          description="Live printer status and shortcuts to start a print."
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {quickActions.map((action) => (
          <Link key={action.title} to={action.url} className="group">
            <Card className="h-full transition-colors group-hover:bg-accent">
              <CardContent className="flex items-start gap-3 p-4">
                <action.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">{action.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {action.description}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-lg">Printers</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{counts.printing} busy</span>
            <span>·</span>
            <span>{counts.ready} ready</span>
            {counts.problem > 0 ? (
              <>
                <span>·</span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {counts.problem} need attention
                </span>
              </>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {statusQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : statusQuery.isError ? (
            <p className="text-sm text-muted-foreground">
              Could not load printer status.
            </p>
          ) : printers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No printers are registered yet.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {printers.map((p) => (
                <Link
                  key={p.printerId}
                  to={PRINTING_ROUTES.monitor}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor(p.state)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.printerName}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {p.stateMessage}
                    </div>
                  </div>
                  <Badge variant="outline">{p.printerType}</Badge>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-4">
            <Button variant="secondary" size="sm" asChild>
              <Link to={PRINTING_ROUTES.monitor}>Open monitor</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
