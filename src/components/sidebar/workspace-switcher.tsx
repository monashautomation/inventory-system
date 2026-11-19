import { Link } from "react-router-dom";
import { Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";

// Authentik application library, the central launcher for all our apps.
const AUTHENTIK_LIBRARY_URL =
  "https://auth.monashautomation.com/if/user/#/library";

/**
 * Shows which app you are in (logo + name) and switches to the other one.
 * Authentik remains the launcher; "All apps" links back to it.
 */
export function WorkspaceSwitcher({
  current,
  onNavigate,
}: {
  current: Workspace;
  onNavigate?: () => void;
}) {
  const active = WORKSPACES[current];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label={`Current app: ${active.label}. Switch app`}
        >
          <img
            src={active.logo}
            alt=""
            className="h-10 w-10 shrink-0 rounded-[28%] shadow-sm"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold leading-tight">
              {active.label}
            </span>
            <span className="block text-xs text-sidebar-foreground/60">
              Operation Tamarin
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {(Object.keys(WORKSPACES) as Workspace[]).map((key) => {
          const ws = WORKSPACES[key];
          return (
            <DropdownMenuItem key={key} asChild onSelect={onNavigate}>
              <Link to={ws.home}>
                <img src={ws.logo} alt="" className="h-5 w-5 rounded-[28%]" />
                <span className="flex-1">{ws.label}</span>
                {key === current ? <Check className="h-4 w-4" /> : null}
              </Link>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={AUTHENTIK_LIBRARY_URL}>
            <LayoutGrid className="h-4 w-4" />
            All apps
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
