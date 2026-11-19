import type { LucideIcon } from "lucide-react";
import {
  ArrowRightToLine,
  BarChart2,
  Box,
  FileText,
  History,
  Home,
  LayoutDashboard,
  ListOrdered,
  MessageCircle,
  Monitor,
  PackageOpen,
  Plus,
  Printer,
  ScanLine,
  ScrollText,
  UserRound,
  Users,
  Video,
  Wrench,
  ClipboardList,
} from "lucide-react";
import { PRINTING_ROUTES } from "@/lib/printingRoutes";
import type { Workspace } from "@/lib/workspaces";

/**
 * Navigation, grouped by how often each place is used. See
 * docs/ui-brand-guidelines.md ("Navigation"). Keep the daily list short:
 * four items at most. Anything occasional goes under "More".
 */
export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shorter label for the phone bottom bar, where space is tight. */
  shortTitle?: string;
  /** Match the path exactly instead of by prefix. */
  exact?: boolean;
  /** Paths that look like children of this item but belong elsewhere. */
  excludePrefixes?: string[];
  /** Which live count to show as a badge. */
  badge?: "pendingRequests" | "myRequests";
}

export interface WorkspaceNav {
  /** The single big action at the top of the sidebar and middle of the phone bar. */
  primary:
    | { kind: "scan"; label: string; icon: LucideIcon }
    | { kind: "link"; label: string; icon: LucideIcon; url: string };
  daily: NavItem[];
  more: NavItem[];
  admin: NavItem[];
  /** Three slots around the primary action in the phone bottom bar
   *  (two left of it, one right), followed by "More". */
  tabs: [NavItem, NavItem, NavItem];
}

const inventoryHome: NavItem = {
  title: "Home",
  url: "/dashboard",
  icon: Home,
  exact: true,
};
const assets: NavItem = {
  title: "Equipment & Assets",
  shortTitle: "Equipment",
  url: "/assets",
  icon: Box,
};
const checkIn: NavItem = {
  title: "Check in",
  url: "/checkin",
  icon: ArrowRightToLine,
};
const consumables: NavItem = {
  title: "Consumables",
  url: "/consumables",
  icon: PackageOpen,
  excludePrefixes: ["/consumables/requests"],
};

const printOverview: NavItem = {
  title: "Overview",
  url: PRINTING_ROUTES.root,
  icon: LayoutDashboard,
  exact: true,
};
const monitor: NavItem = {
  title: "Monitor",
  url: PRINTING_ROUTES.monitor,
  icon: Monitor,
};
const queue: NavItem = {
  title: "Queue",
  url: PRINTING_ROUTES.queue,
  icon: ListOrdered,
};
const myPrints: NavItem = {
  title: "My prints",
  url: PRINTING_ROUTES.myPrints,
  icon: UserRound,
};

export const NAV: Record<Workspace, WorkspaceNav> = {
  inventory: {
    primary: { kind: "scan", label: "Scan item", icon: ScanLine },
    daily: [inventoryHome, assets, checkIn, consumables],
    more: [
      {
        title: "My requests",
        url: "/my-requests",
        icon: FileText,
        badge: "myRequests",
      },
      { title: "Activity", url: "/activity", icon: ScrollText },
      { title: "Chat", url: "/chat", icon: MessageCircle },
    ],
    admin: [
      {
        title: "Requests",
        url: "/consumables/requests",
        icon: ClipboardList,
        badge: "pendingRequests",
      },
      { title: "Members", url: "/members", icon: Users },
    ],
    tabs: [assets, checkIn, consumables],
  },
  printing: {
    primary: {
      kind: "link",
      label: "New print",
      icon: Plus,
      url: `${PRINTING_ROUTES.queue}?open=upload`,
    },
    daily: [printOverview, monitor, queue, myPrints],
    more: [
      { title: "Send G-code", url: PRINTING_ROUTES.send, icon: Printer },
      { title: "Cameras", url: PRINTING_ROUTES.cameras, icon: Video },
      { title: "History", url: PRINTING_ROUTES.history, icon: History },
      { title: "Stats", url: PRINTING_ROUTES.stats, icon: BarChart2 },
    ],
    admin: [{ title: "Printers", url: PRINTING_ROUTES.printers, icon: Wrench }],
    tabs: [monitor, queue, myPrints],
  },
};

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.excludePrefixes?.some((p) => pathname.startsWith(p))) return false;
  if (item.exact) return pathname === item.url;
  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}
