import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";

// Authentik application library, the central launcher for all our apps.
const AUTHENTIK_LIBRARY_URL =
  "https://auth.monashautomation.com/if/user/#/library";

/**
 * Shows which app you are in (big logo + name) and lets you hop to the other
 * one. Authentik remains the launcher; "All apps" links back to it.
 */
export function WorkspaceSwitcher({ current }: { current: Workspace }) {
  const active = WORKSPACES[current];

  return (
    <div className="mb-3 space-y-2 px-1">
      <div className="flex items-center gap-3">
        <img
          src={active.logo}
          alt=""
          className="h-11 w-11 shrink-0 rounded-[28%] shadow-sm"
        />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold leading-tight">
            {active.label}
          </div>
          <div className="text-xs text-sidebar-foreground/60">
            Operation Tamarin
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-sidebar-accent/50 p-1"
        role="group"
        aria-label="Switch app"
      >
        {(Object.keys(WORKSPACES) as Workspace[]).map((key) => {
          const ws = WORKSPACES[key];
          const isActive = key === current;
          return (
            <Link
              key={key}
              to={ws.home}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[13px] transition-colors",
                isActive
                  ? "bg-background font-medium shadow-sm ring-1 ring-[#1393FF]/60"
                  : "text-sidebar-foreground/70 hover:bg-background/60 hover:text-sidebar-foreground",
              )}
            >
              <img
                src={ws.logo}
                alt=""
                className="h-5 w-5 shrink-0 rounded-[28%]"
              />
              <span>{ws.label}</span>
            </Link>
          );
        })}
      </div>

      <a
        href={AUTHENTIK_LIBRARY_URL}
        className="flex items-center gap-1.5 px-1 text-xs text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground"
      >
        <LayoutGrid className="h-3 w-3" />
        All apps
      </a>
    </div>
  );
}
