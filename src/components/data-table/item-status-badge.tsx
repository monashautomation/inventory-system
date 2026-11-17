import { Badge } from "@/components/ui/badge";
import type { LoanState } from "@/lib/loan";

/**
 * Loan status as a calm chip. Being on loan is normal, so it is blue, not red.
 * Red is reserved for things that need action (e.g. overdue).
 */
export function ItemStatusBadge({
  state,
  heldByMe,
}: {
  state: LoanState;
  heldByMe?: boolean;
}) {
  if (state === "lab") return <Badge variant="secondary">Lab use</Badge>;
  if (state === "loaned")
    return (
      <Badge variant="info">{heldByMe ? "On loan · you" : "On loan"}</Badge>
    );
  return <Badge variant="success">In storage</Badge>;
}
