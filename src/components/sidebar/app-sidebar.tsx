import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, ShoppingCartIcon } from "lucide-react";
import logoHorizontalDark from "@/assets/Horizontal White & Blue.svg";
import logoHorizontalLight from "@/assets/Horizontal Black & Blue.svg";
import { authClient } from "@/auth/client";
import { trpc } from "@/client/trpc";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ScanItemButton } from "@/components/scan/scan-item-button";
import { ThemeToggle } from "@/components/sidebar/theme-toggle";
import { WorkspaceSwitcher } from "@/components/sidebar/workspace-switcher";
import {
  NAV,
  isNavActive,
  type NavItem,
} from "@/components/sidebar/nav-config";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user/UserAvatar";
import { useCart } from "@/contexts/cart-context";
import { isPrintingPath } from "@/lib/printingRoutes";
import { cn } from "@/lib/utils";

const activeMarker =
  "data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--sidebar-primary)]";

function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto h-5 min-w-5 rounded-full bg-warning-bg px-1.5 text-center text-xs font-semibold leading-5 tabular-nums text-warning">
      {count}
    </span>
  );
}

export function AppSidebar() {
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";
  const workspace = isPrintingPath(pathname) ? "printing" : "inventory";
  const nav = NAV[workspace];

  const { data: pendingRequestCount } =
    trpc.consumableRequest.pendingCount.useQuery(undefined, {
      enabled: isAdmin,
      refetchInterval: 30000,
    });
  const { data: myPendingData } =
    trpc.consumableRequest.myPendingCount.useQuery(undefined, {
      refetchInterval: 60000,
    });

  const counts = {
    pendingRequests: pendingRequestCount ?? 0,
    myRequests: myPendingData?.count ?? 0,
  };
  const badgeFor = (item: NavItem) => (item.badge ? counts[item.badge] : 0);

  const moreHasActive = nav.more.some((i) => isNavActive(pathname, i));
  const moreCount = nav.more.reduce((n, i) => n + badgeFor(i), 0);
  // Collapsed by default; opens by itself when you are on one of its pages.
  const [moreOpenState, setMoreOpen] = useState(false);
  const moreOpen = moreOpenState || moreHasActive;

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const renderItem = (item: NavItem) => (
    <SidebarMenuItem key={item.url}>
      <SidebarMenuButton
        asChild
        isActive={isNavActive(pathname, item)}
        className={activeMarker}
      >
        <Link to={item.url} onClick={closeMobile}>
          <item.icon />
          <span>{item.title}</span>
          <CountBadge count={badgeFor(item)} />
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const primaryButton = (
    <Button className="w-full" size="lg">
      <nav.primary.icon />
      {nav.primary.label}
    </Button>
  );

  return (
    <Sidebar>
      <SidebarHeader className="gap-3 p-3">
        <Link to="/dashboard" onClick={closeMobile} className="px-1.5 pt-1">
          <img
            src={logoHorizontalLight}
            alt="Monash Automation"
            className="h-6 w-auto dark:hidden"
          />
          <img
            src={logoHorizontalDark}
            alt="Monash Automation"
            className="hidden h-6 w-auto dark:block"
          />
        </Link>
        <WorkspaceSwitcher current={workspace} onNavigate={closeMobile} />
        {nav.primary.kind === "scan" ? (
          <ScanItemButton>{primaryButton}</ScanItemButton>
        ) : (
          <Link to={nav.primary.url} onClick={closeMobile}>
            {primaryButton}
          </Link>
        )}
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup className="py-1">
          <SidebarMenu>{nav.daily.map(renderItem)}</SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                className="text-sidebar-foreground/70"
              >
                <ChevronRight
                  className={cn(
                    "transition-transform duration-200",
                    moreOpen && "rotate-90",
                  )}
                />
                <span>More</span>
                {!moreOpen ? <CountBadge count={moreCount} /> : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
            {moreOpen ? nav.more.map(renderItem) : null}
          </SidebarMenu>
        </SidebarGroup>

        {isAdmin ? (
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="uppercase tracking-wider">
              Admin
            </SidebarGroupLabel>
            <SidebarMenu>{nav.admin.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="gap-1 border-t p-2">
        {workspace === "inventory" ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/cart"}
                className={cn(
                  activeMarker,
                  itemCount > 0 &&
                    "bg-warning-bg text-warning hover:bg-warning-bg",
                )}
              >
                <Link to="/cart" onClick={closeMobile}>
                  <ShoppingCartIcon />
                  <span>Cart</span>
                  <CountBadge count={itemCount} />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        <div className="flex items-center gap-1 px-1">
          <button
            type="button"
            onClick={() => {
              void navigate("/settings");
              closeMobile();
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            aria-label="Account settings"
            title="Account settings"
          >
            <UserAvatar
              name={session?.user.name}
              image={session?.user.image}
              size="sm"
            />
            <span className="truncate">{session?.user.name ?? "Account"}</span>
          </button>
          <NotificationBell />
          <ThemeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
