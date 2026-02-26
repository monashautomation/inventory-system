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
import { Badge } from "@/components/ui/badge";

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
                    className="flex items-center gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingCartIcon />
                      <span>Cart</span>
                    </div>
                    {itemCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums ml-auto"
                      >
                        {itemCount}
                      </Badge>
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
