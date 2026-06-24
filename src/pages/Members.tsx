import { useState } from "react";
import { trpc } from "@/client/trpc";
import { authClient } from "@/auth/client";
import { Navigate } from "react-router-dom";
import {
  Users,
  ShieldCheck,
  ShieldOff,
  Ban,
  CheckCircle,
  RefreshCw,
  ImageOff,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Loading from "@/components/misc/loading";
import ErrorPage from "@/pages/Error";
import { UserAvatar } from "@/components/user/UserAvatar";
import type { AppRouter } from "@/server/api/routers/_app";
import type { inferProcedureOutput } from "@trpc/server";

type Member = inferProcedureOutput<AppRouter["user"]["members"]>[number];

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function MemberAvatar({ member }: { member: Member }) {
  return <UserAvatar name={member.name} image={member.image} size="sm" />;
}

interface BanDialogProps {
  member: Member | null;
  onClose: () => void;
  onConfirm: (reason: string, expiresAt: string | undefined) => void;
  isPending: boolean;
}

function BanDialog({ member, onClose, onConfirm, isPending }: BanDialogProps) {
  const [reason, setReason] = useState("");
  const [isTempBan, setIsTempBan] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  function handleConfirm() {
    const expires =
      isTempBan && expiresAt ? new Date(expiresAt).toISOString() : undefined;
    onConfirm(reason, expires);
  }

  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban {member?.name}</DialogTitle>
          <DialogDescription>
            This user will be blocked from accessing the system.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ban-reason">Reason (optional)</Label>
            <Input
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Misuse of equipment"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="temp-ban"
              type="checkbox"
              checked={isTempBan}
              onChange={(e) => setIsTempBan(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="temp-ban">Temporary ban</Label>
          </div>
          {isTempBan && (
            <div className="space-y-1.5">
              <Label htmlFor="ban-expires">Ban until</Label>
              <Input
                id="ban-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isPending || (isTempBan && !expiresAt)}
          >
            {isPending ? "Banning…" : "Ban user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RoleDialogProps {
  member: Member | null;
  targetRole: "admin" | "user";
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}

function RoleDialog({
  member,
  targetRole,
  onClose,
  onConfirm,
  isPending,
}: RoleDialogProps) {
  const promoting = targetRole === "admin";
  return (
    <Dialog open={!!member} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {promoting ? "Make admin" : "Remove admin"}: {member?.name}
          </DialogTitle>
          <DialogDescription>
            {promoting
              ? "This user will gain full admin access to the system."
              : "This user will lose admin privileges and revert to a standard user."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={promoting ? "default" : "destructive"}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Saving…" : promoting ? "Make admin" : "Remove admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Members() {
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user.role === "admin";

  const [search, setSearch] = useState("");
  const [banTarget, setBanTarget] = useState<Member | null>(null);
  const [roleTarget, setRoleTarget] = useState<{
    member: Member;
    role: "admin" | "user";
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: members, isLoading, error } = trpc.user.members.useQuery();

  const discordIds = (members ?? [])
    .map((m) => m.discordId)
    .filter((id): id is string => !!id);

  const { data: discordValidation } = trpc.user.validateDiscordIds.useQuery(
    { discordIds },
    { enabled: discordIds.length > 0, staleTime: 5 * 60 * 1000 },
  );

  const { data: syncStatus, refetch: refetchSyncStatus } =
    trpc.user.memberSyncStatus.useQuery(undefined, { refetchInterval: 10000 });

  const syncAllMutation = trpc.user.syncAllMembers.useMutation({
    onSuccess: (result) => {
      toast.success(
        `Sync complete — ${result.updated} updated, ${result.skipped} unchanged`,
      );
      void utils.user.members.invalidate();
      void refetchSyncStatus();
    },
    onError: (e) => toast.error(e.message),
  });

  const syncOneMutation = trpc.user.syncOneMember.useMutation({
    onSuccess: (result) => {
      toast.success(result.updated ? "Member synced" : "No changes found");
      void utils.user.members.invalidate();
      void refetchSyncStatus();
    },
    onError: (e) => toast.error(e.message),
  });

  const banMutation = trpc.user.ban.useMutation({
    onSuccess: () => {
      toast.success("User banned");
      setBanTarget(null);
      void utils.user.members.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const unbanMutation = trpc.user.unban.useMutation({
    onSuccess: () => {
      toast.success("Ban lifted");
      void utils.user.members.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const roleMutation = trpc.user.setRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      setRoleTarget(null);
      void utils.user.members.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const removeAvatarMutation = trpc.user.removeAvatar.useMutation({
    onSuccess: () => {
      toast.success("Avatar removed");
      void utils.user.members.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  if (isLoading) return <Loading />;
  if (error) return <ErrorPage />;

  const filtered = (members ?? []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.name?.toLowerCase().includes(q) ||
      m.email?.toLowerCase().includes(q) ||
      m.studentNumber?.toLowerCase().includes(q) ||
      m.group?.name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="container mx-auto py-3 p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="size-6 text-muted-foreground" />
          <div>
            <h1 className="text-3xl font-bold">Members</h1>
            <p className="text-muted-foreground">
              Manage users, roles, and access
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending || syncStatus?.isSyncing}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${syncAllMutation.isPending || syncStatus?.isSyncing ? "animate-spin" : ""}`}
            />
            {syncAllMutation.isPending || syncStatus?.isSyncing
              ? "Syncing…"
              : "Refresh all"}
          </Button>
          {syncStatus && (
            <p className="text-xs text-muted-foreground">
              {syncStatus.lastSyncAt
                ? `Last synced ${formatDate(syncStatus.lastSyncAt)}`
                : "Not yet synced"}
              {syncStatus.totalCached > 0 &&
                ` · ${syncStatus.totalCached} cached`}
            </p>
          )}
          {syncStatus?.lastError && (
            <p className="text-xs text-destructive max-w-xs text-right truncate">
              {syncStatus.lastError}
            </p>
          )}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <Input
          placeholder="Search by name, email, student ID, or group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} member{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[220px]">User</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>Discord ID</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-10"
                >
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((member) => {
                const lastActive = member.sessions[0]?.updatedAt ?? null;
                const isSelf = member.id === session?.user.id;
                const inNotion = !!(member.studentNumber || member.group);

                return (
                  <TableRow
                    key={member.id}
                    className={!inNotion ? "opacity-60" : undefined}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar member={member} />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {member.name ?? "—"}
                            {isSelf && (
                              <span className="ml-1.5 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.email}
                          </p>
                          {!inNotion && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                              Not found in Notion database
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.studentNumber ?? (
                        <span className="text-muted-foreground">
                          {inNotion ? "—" : "N/A"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.discordId ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono">{member.discordId}</span>
                          {discordValidation &&
                            (discordValidation[member.discordId] === false ? (
                              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                Not found in Monash Server
                              </span>
                            ) : discordValidation[member.discordId] === true ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle className="h-3 w-3 shrink-0" />
                                Verified
                              </span>
                            ) : null)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {member.group?.name ?? (
                        <span className="text-muted-foreground">
                          {inNotion ? "—" : "N/A"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.role === "admin" ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-200 border-0">
                          Admin
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-muted-foreground"
                        >
                          User
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.banned ? (
                        <div>
                          <Badge className="bg-destructive/15 text-destructive border-0">
                            {member.banExpires ? "Temp banned" : "Banned"}
                          </Badge>
                          {member.banExpires && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Until {formatDate(member.banExpires)}
                            </p>
                          )}
                          {member.banReason && (
                            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                              {member.banReason}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 border-0"
                        >
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(lastActive)}
                    </TableCell>
                    <TableCell>
                      {!isSelf && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                syncOneMutation.mutate({ userId: member.id })
                              }
                              disabled={syncOneMutation.isPending || !inNotion}
                              title={
                                !inNotion
                                  ? "User not found in Notion database"
                                  : undefined
                              }
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Refresh from Notion
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {member.role === "admin" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleTarget({ member, role: "user" })
                                }
                                className="text-destructive focus:text-destructive"
                              >
                                <ShieldOff className="mr-2 h-4 w-4" />
                                Remove admin
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRoleTarget({ member, role: "admin" })
                                }
                              >
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                Make admin
                              </DropdownMenuItem>
                            )}
                            {member.image && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    removeAvatarMutation.mutate({
                                      id: member.id,
                                    })
                                  }
                                  disabled={removeAvatarMutation.isPending}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <ImageOff className="mr-2 h-4 w-4" />
                                  Remove photo
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            {member.banned ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  unbanMutation.mutate({ id: member.id })
                                }
                              >
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Lift ban
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() => setBanTarget(member)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Ban className="mr-2 h-4 w-4" />
                                Ban user
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <BanDialog
        member={banTarget}
        onClose={() => setBanTarget(null)}
        onConfirm={(reason, expiresAt) =>
          banMutation.mutate({ id: banTarget!.id, reason, expiresAt })
        }
        isPending={banMutation.isPending}
      />

      <RoleDialog
        member={roleTarget?.member ?? null}
        targetRole={roleTarget?.role ?? "user"}
        onClose={() => setRoleTarget(null)}
        onConfirm={() =>
          roleMutation.mutate({
            id: roleTarget!.member.id,
            role: roleTarget!.role,
          })
        }
        isPending={roleMutation.isPending}
      />
    </div>
  );
}
