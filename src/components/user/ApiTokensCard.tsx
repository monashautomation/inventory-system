import { useState } from "react";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { KeyRound, Copy, Trash2, ShieldCheck } from "lucide-react";

/**
 * API token management for the `maims` CLI and other integrations.
 * Tokens are stored hashed; the plaintext is shown exactly once on creation.
 */
export function ApiTokensCard() {
  const utils = trpc.useUtils();
  const { data: tokens, isLoading } = trpc.apiToken.listMine.useQuery();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const createMut = trpc.apiToken.create.useMutation({
    onSuccess: (token) => {
      setCreatedSecret(token.token);
      setName("");
      setExpiresInDays("");
      void utils.apiToken.listMine.invalidate();
    },
    onError: (e) => toast.error(`Could not create token: ${e.message}`),
  });

  const revokeMut = trpc.apiToken.revoke.useMutation({
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Token revoked");
      void utils.apiToken.listMine.invalidate();
    },
    onError: (e) => toast.error(`Could not revoke token: ${e.message}`),
  });

  async function copySecret() {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      toast.success("Token copied");
    } catch {
      toast.error("Clipboard unavailable — copy it manually");
    }
  }

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Token needs a name");
      return;
    }
    const days = expiresInDays.trim() ? Number(expiresInDays) : undefined;
    if (
      days !== undefined &&
      (!Number.isInteger(days) || days < 1 || days > 365)
    ) {
      toast.error("Expiry must be a whole number of days between 1 and 365");
      return;
    }
    createMut.mutate({ name: trimmed, readOnly: true, expiresInDays: days });
  }

  return (
    <Card className="border-muted">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">API tokens</CardTitle>
        </div>
        <CardDescription>
          Tokens authenticate the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">maims</code>{" "}
          CLI and other integrations. They are stored hashed and shown only
          once. All tokens are read-only: they can view everything the UI shows
          but cannot change anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {isLoading ? "Loading tokens…" : `${tokens?.length ?? 0} token(s)`}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setCreatedSecret(null);
              setCreateOpen(true);
            }}
          >
            New token
          </Button>
        </div>

        {tokens && tokens.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {t.preview}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.readOnly ? "secondary" : "destructive"}>
                      {t.readOnly ? "read-only" : "read-write"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.lastUsedAt
                      ? new Date(t.lastUsedAt).toLocaleDateString()
                      : "never"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {t.revokedAt ? (
                      <span className="text-destructive">revoked</span>
                    ) : t.expiresAt ? (
                      new Date(t.expiresAt).toLocaleDateString()
                    ) : (
                      "never"
                    )}
                  </TableCell>
                  <TableCell>
                    {!t.revokedAt && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={revokeMut.isPending}
                        onClick={() => revokeMut.mutate({ id: t.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          {createdSecret ? (
            <>
              <DialogHeader>
                <DialogTitle>Copy your token now</DialogTitle>
                <DialogDescription>
                  This is the only time it will be shown. It is stored hashed —
                  if you lose it, create a new one.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-muted p-3 font-mono text-xs">
                  {createdSecret}
                </code>
                <Button size="sm" onClick={() => void copySecret()}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-start gap-2 rounded border border-muted bg-muted/40 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Use it with:{" "}
                  <code className="font-mono">
                    maims auth -u inventory.monashautomation.com -t
                    &lt;token&gt;
                  </code>
                </span>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API token</DialogTitle>
                <DialogDescription>
                  Give it a name so you can recognise and revoke it later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token-name">Name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g. laptop CLI"
                    value={name}
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token-expiry">
                    Expires in (days, optional)
                  </Label>
                  <Input
                    id="token-expiry"
                    type="number"
                    min={1}
                    max={365}
                    placeholder="leave blank for no expiry"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating…" : "Create token"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
