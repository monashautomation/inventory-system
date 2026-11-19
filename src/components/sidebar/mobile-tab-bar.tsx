import { Link, useLocation } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { ScanItemButton } from "@/components/scan/scan-item-button";
import {
  NAV,
  isNavActive,
  type NavItem,
} from "@/components/sidebar/nav-config";
import { useSidebar } from "@/components/ui/sidebar";
import { isPrintingPath, PRINTING_ROUTES } from "@/lib/printingRoutes";
import { cn } from "@/lib/utils";

const tabClass =
  "flex flex-col items-center gap-0.5 rounded-md px-1 py-1 text-[11px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Phone-only bottom bar: three daily destinations, the app's primary action
 * in the middle (Scan, or New print) and "More", which opens the full menu.
 * Hidden from md up, where the sidebar is always visible.
 */
export function MobileTabBar() {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const workspace = isPrintingPath(pathname) ? "printing" : "inventory";
  const nav = NAV[workspace];

  // The camera wall is full-screen.
  if (pathname === PRINTING_ROUTES.cameras) return null;

  const tab = (item: NavItem) => {
    const active = isNavActive(pathname, item);
    return (
      <Link
        key={item.url}
        to={item.url}
        aria-current={active ? "page" : undefined}
        className={cn(tabClass, active ? "text-primary" : "text-white/75")}
      >
        <item.icon className="h-5 w-5" />
        {item.title}
      </Link>
    );
  };

  const fab = (
    <span
      className="-mt-7 grid h-14 w-14 place-items-center rounded-full border-4 border-[#231f20] bg-primary text-primary-foreground shadow-md"
      aria-hidden
    >
      <nav.primary.icon className="h-6 w-6" />
    </span>
  );
  const fabLabel = (
    <span className="mt-0.5 text-[11px] font-semibold text-white">
      {nav.primary.label}
    </span>
  );

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#231f20] pb-[env(safe-area-inset-bottom,0px)] md:hidden"
    >
      <div className="grid grid-cols-5 items-end px-1 pt-1.5 pb-1.5">
        {tab(nav.tabs[0])}
        {tab(nav.tabs[1])}
        {nav.primary.kind === "scan" ? (
          <ScanItemButton>
            <button
              type="button"
              aria-label={nav.primary.label}
              className="flex flex-col items-center outline-none"
            >
              {fab}
              {fabLabel}
            </button>
          </ScanItemButton>
        ) : (
          <Link
            to={nav.primary.url}
            aria-label={nav.primary.label}
            className="flex flex-col items-center outline-none"
          >
            {fab}
            {fabLabel}
          </Link>
        )}
        {tab(nav.tabs[2])}
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className={cn(tabClass, "text-white/75")}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  );
}
