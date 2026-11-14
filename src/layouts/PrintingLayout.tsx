import { NavLink, Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PRINTING_ROUTES, PRINTING_TABS } from "@/lib/printingRoutes";
import printingLogo from "@/assets/ma-3d-print.svg";

/**
 * Shared shell for every /printing/* page: a tab strip for quick switching
 * between sections (useful when the sidebar is collapsed, e.g. on mobile).
 * Cameras is a full-screen wall, so it renders without the strip.
 */
export default function PrintingLayout() {
  const { pathname } = useLocation();

  if (pathname === PRINTING_ROUTES.cameras) {
    return <Outlet />;
  }

  return (
    <div>
      <nav
        aria-label="Printing sections"
        className="flex items-center gap-3 overflow-x-auto border-b px-4 sm:px-6"
      >
        <div className="flex shrink-0 items-center gap-2 py-2 pr-2 font-semibold">
          <img src={printingLogo} alt="" className="h-6 w-6 rounded-[28%]" />
          <span>Printing</span>
        </div>
        <ul className="flex min-w-max gap-1">
          {PRINTING_TABS.map((tab) => (
            <li key={tab.url}>
              <NavLink
                to={tab.url}
                end={tab.url === PRINTING_ROUTES.root}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {tab.title}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
