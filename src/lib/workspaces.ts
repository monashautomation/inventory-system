import inventoryLogo from "@/assets/ma-inventory.svg";
import printingLogo from "@/assets/ma-3d-print.svg";
import { PRINTING_ROUTES } from "@/lib/printingRoutes";

export type Workspace = "inventory" | "printing";

export const WORKSPACES: Record<
  Workspace,
  { label: string; logo: string; home: string }
> = {
  inventory: { label: "Inventory", logo: inventoryLogo, home: "/dashboard" },
  printing: {
    label: "Printing",
    logo: printingLogo,
    home: PRINTING_ROUTES.root,
  },
};
