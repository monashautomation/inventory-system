import { useNavigate } from "react-router-dom";

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
} from "lucide-react";

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

// Menu items.
const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: Home,
  },
  {
    title: "Assets",
    url: "/assets",
    icon: Box,
  },
  {
    title: "Consumables",
    url: "/consumables",
    icon: PackageOpen,
  },
  {
    title: "Check-in",
    url: "/checkin",
    icon: ArrowRightToLine,
  },
  {
    title: "Transactions",
    url: "/transactions",
    icon: ArrowLeftRight,
  },
  {
    title: "Chat",
    url: "/chat",
    icon: MessageCircle,
  },
  {
    title: "Print",
    url: "/print",
    icon: Printer,
  },
  {
    title: "Monitor",
    url: "/print-monitor",
    icon: Monitor,
  },
  {
    title: "Printers",
    url: "/printer-management",
    icon: Wrench,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const { itemCount } = useCart();
  const navigate = useNavigate();

  return (
    <Sidebar>
      <SidebarContent className="min-h-full">
        <SidebarGroup className="min-h-full">
          <SidebarGroupLabel>Inventory System</SidebarGroupLabel>
          <div className="flex flex-col justify-between grow">
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
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
                <SidebarGroupLabel>Created by Team SubSeven</SidebarGroupLabel>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
