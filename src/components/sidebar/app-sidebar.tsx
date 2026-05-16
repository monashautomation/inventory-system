import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logoHorizontalDark from "@/assets/Horizontal White & Blue.svg";
import logoHorizontalLight from "@/assets/Horizontal Black & Blue.svg";

import {
  Box,
  Settings,
  Home,
  PackageOpen,
  ArrowLeftRight,
  ShoppingCartIcon,
  ArrowRightToLine,
  MessageCircle,
  Printer,
  Monitor,
  Wrench,
  ClipboardList,
  FileText,
  ScrollText,
  ChevronDown,
} from "lucide-react";
import { authClient } from "@/auth/client";
import { trpc } from "@/client/trpc";
import { NotificationBell } from "@/components/notifications/NotificationBell";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/sidebar/theme-toggle";
import { useCart } from "@/contexts/cart-context";
import { cn } from "@/lib/utils";

const coreItems = [
  { title: "Dashboard", url: "/dashboard", icon: Home },
  { title: "Assets", url: "/assets", icon: Box },
  { title: "Consumables", url: "/consumables", icon: PackageOpen },
  { title: "Check-in", url: "/checkin", icon: ArrowRightToLine },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
  { title: "Chat", url: "/chat", icon: MessageCircle },
];

const printingItems = [
  { title: "Print", url: "/print", icon: Printer },
  { title: "Monitor", url: "/print-monitor", icon: Monitor },
  { title: "Printers", url: "/printer-management", icon: Wrench },
];

export function AppSidebar() {
  const [printingOpen, setPrintingOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const { data: pendingRequestCount } =
    trpc.consumableRequest.pendingCount.useQuery(undefined, {
      enabled: isAdmin,
      refetchInterval: 30000,
    });

  const { data: myPendingData } =
    trpc.consumableRequest.myPendingCount.useQuery(undefined, {
      refetchInterval: 60000,
    });

  return (
    <Sidebar>
      <SidebarContent className="min-h-full">
        <SidebarGroup className="min-h-full">
          <div className="px-2 py-2">
            <img
              src={logoHorizontalLight}
              alt="Monash Automation"
              className="h-7 w-auto dark:hidden"
            />
            <img
              src={logoHorizontalDark}
              alt="Monash Automation"
              className="h-7 w-auto hidden dark:block"
            />
          </div>
          <div className="flex flex-col justify-between grow">
            <SidebarGroupContent>
              <SidebarMenu>
                {coreItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a onClick={() => void navigate(item.url)}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a
                      onClick={() => void navigate("/my-requests")}
                      className="flex items-center gap-2"
                    >
                      <FileText />
                      <span>My Requests</span>
                      {myPendingData && myPendingData.count > 0 ? (
                        <span className="ml-auto h-5 min-w-5 rounded-full bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 leading-5 text-center tabular-nums">
                          {myPendingData.count}
                        </span>
                      ) : null}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>

              {/* Printing group */}
              <div className="mt-2">
                <button
                  onClick={() => setPrintingOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                >
                  <span className="uppercase tracking-wider">Printing</span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      !printingOpen && "-rotate-90",
                    )}
                  />
                </button>
                {printingOpen && (
                  <SidebarMenu className="mt-0.5">
                    {printingItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <a onClick={() => void navigate(item.url)}>
                            <item.icon />
                            <span>{item.title}</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                )}
              </div>

              {/* Administration group — admins only */}
              {isAdmin && (
                <div className="mt-2">
                  <button
                    onClick={() => setAdminOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-2 py-1 text-xs font-medium text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                  >
                    <span className="uppercase tracking-wider">
                      Administration
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 transition-transform duration-200",
                        !adminOpen && "-rotate-90",
                      )}
                    />
                  </button>
                  {adminOpen && (
                    <SidebarMenu className="mt-0.5">
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <a
                            onClick={() =>
                              void navigate("/consumables/requests")
                            }
                            className="flex items-center gap-2"
                          >
                            <ClipboardList />
                            <span>Requests</span>
                            {pendingRequestCount && pendingRequestCount > 0 ? (
                              <span className="ml-auto h-5 min-w-5 rounded-full bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200 leading-5 text-center tabular-nums">
                                {pendingRequestCount}
                              </span>
                            ) : null}
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <a
                            onClick={() => void navigate("/audit-log")}
                            className="flex items-center gap-2"
                          >
                            <ScrollText />
                            <span>Audit Log</span>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  )}
                </div>
              )}

              <SidebarMenu className="mt-2">
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <a onClick={() => void navigate("/settings")}>
                      <Settings />
                      <span>Settings</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>

            <div>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    onClick={() => void navigate("/cart")}
                    className={cn(
                      "flex items-center gap-2 rounded-md transition-all",
                      itemCount > 0 &&
                        "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/40 shadow-sm hover:bg-amber-500/20",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingCartIcon
                        className={cn(
                          itemCount > 0 && "text-amber-600 dark:text-amber-300",
                        )}
                      />
                      <span>Cart</span>
                    </div>
                    {itemCount > 0 && (
                      <span className="relative ml-auto h-6 min-w-6 rounded-full border border-amber-500/50 bg-amber-500/20 px-1.5 text-amber-800 dark:text-amber-200">
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold leading-none tabular-nums">
                          {itemCount}
                        </span>
                      </span>
                    )}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <div className="flex justify-between mr-2 mt-3 items-center">
                <SidebarGroupLabel>Operation Tamarin</SidebarGroupLabel>
                <div className="flex items-center gap-1">
                  <NotificationBell />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
