import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { trpc } from "@/client/trpc";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const { data: unreadData } = trpc.notification.unreadCount.useQuery(
    undefined,
    { refetchInterval: 30000 },
  );

  const { data: notifications } = trpc.notification.list.useQuery(
    { unreadOnly: false, limit: 30 },
    { enabled: open },
  );

  const markReadMut = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      void utils.notification.unreadCount.invalidate();
      void utils.notification.list.invalidate();
    },
  });

  const markAllMut = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notification.unreadCount.invalidate();
      void utils.notification.list.invalidate();
    },
  });

  const unreadCount = unreadData?.count ?? 0;
  const items = notifications ?? [];

  function handleNotificationClick(n: (typeof items)[number]) {
    if (!n.readAt) {
      markReadMut.mutate({ ids: [n.id] });
    }
    setOpen(false);
    if (n.entityType === "ConsumableRequest" && n.entityId) {
      void navigate(`/my-requests?id=${n.entityId}`);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-7 w-7"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white leading-none tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              onClick={() => markAllMut.mutate()}
              disabled={markAllMut.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No notifications
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const isUnread = !n.readAt;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        "w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors",
                        isUnread && "bg-amber-50/60 dark:bg-amber-900/10",
                      )}
                      onClick={() => handleNotificationClick(n)}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && (
                          <span className="mt-1.5 shrink-0 h-2 w-2 rounded-full bg-amber-500" />
                        )}
                        <div className={cn("min-w-0", !isUnread && "pl-4")}>
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              isUnread ? "font-semibold" : "text-muted-foreground",
                            )}
                          >
                            {n.title}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {n.body}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-muted-foreground/70">
                            {relativeTime(new Date(n.createdAt))}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
