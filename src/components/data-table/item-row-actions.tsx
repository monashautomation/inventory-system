import { Link } from "react-router-dom";
import {
  MoreHorizontal,
  PackagePlus,
  Pencil,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LoanState } from "@/lib/loan";

interface ItemRowActionsProps {
  consumable: boolean;
  loanState: LoanState;
  heldByMe: boolean;
  inCart: boolean;
  isAdmin?: boolean;
  isDeleting?: boolean;
  onAddToCart: () => void;
  onModify: () => void;
  onDelete: () => void;
}

/**
 * One action per row, based on what is possible for that item:
 * Equipment: Add to loan (blue), Return if you hold it, or nothing if someone
 * else does. Consumables: Request more, because members cannot take consumables
 * from the cart; they ask for more to be bought. Edit and delete live in a
 * "more" menu for admins.
 */
export function ItemRowActions({
  consumable,
  loanState,
  heldByMe,
  inCart,
  isAdmin,
  isDeleting,
  onAddToCart,
  onModify,
  onDelete,
}: ItemRowActionsProps) {
  let primary: React.ReactNode = null;

  if (consumable) {
    primary = (
      <Button size="sm" onClick={onAddToCart}>
        <PackagePlus className="h-3.5 w-3.5" />
        Request more
      </Button>
    );
  } else if (loanState === "loaned" && heldByMe) {
    primary = (
      <Button size="sm" variant="outline" asChild>
        <Link to="/checkin">Return</Link>
      </Button>
    );
  } else if (loanState === "stored" && inCart) {
    primary = (
      <Button size="sm" variant="outline" disabled>
        On your loan
      </Button>
    );
  } else if (loanState === "stored") {
    primary = (
      <Button size="sm" onClick={onAddToCart}>
        <ShoppingCart className="h-3.5 w-3.5" />
        Add to loan
      </Button>
    );
  }

  return (
    <div className="flex min-w-[150px] items-center justify-end gap-1">
      {primary}
      {isAdmin ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onModify}>
              <Pencil className="h-4 w-4" />
              Edit item
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isDeleting}
              onSelect={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
