"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  filterUnviewed,
  formatNotifDate,
  formatNotifDescription,
  formatNotifTotal,
  formatRelativeTime,
  mergeViewed,
  newArrivals,
  type NotifRow,
  POLL_INTERVAL_MS,
  SEEDED_KEY,
  VIEWED_IDS_CAP,
  VIEWED_IDS_KEY,
} from "@/lib/admin/notifications";

const PENDING_HREF = "/admin/bookings?status=Pending";

/** Pending-queue URL that also focuses (highlights) a specific booking row. */
function pendingFocusHref(id: string): string {
  return `${PENDING_HREF}&focus=${encodeURIComponent(id)}`;
}

type NotifResponse = { bookings: NotifRow[] };

/**
 * Admin header notification bell. Polls /api/admin/notifications every
 * POLL_INTERVAL_MS for the latest pending bookings and renders a traditional
 * notification panel: pending bookings stay listed until the admin explicitly
 * clears them. Clicking a row only navigates to the booking. The badge counts
 * uncleared notifications.
 *
 * First-visit seed: the very first time the bell mounts (SEEDED_KEY unset) it
 * marks every currently-pending booking as viewed, so the bell starts empty
 * and only genuinely new bookings badge/toast from then on. Reloads keep the
 * persisted viewed set, so read/unread state survives refreshes.
 *
 * Refs hold the values the poll callback reads so the interval does not
 * re-subscribe on every state change; state holds only what must re-render
 * (the list, the viewed set, open state).
 */
export default function NotificationBell() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [bookings, setBookings] = useState<NotifRow[]>([]);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  // Read-mostly mirrors so the poll callback reads fresh values without
  // re-subscribing the interval on every change.
  const viewedIdsRef = useRef<Set<string>>(new Set());
  const openRef = useRef(false);
  const inFlightRef = useRef(false);

  // High-water mark of the newest booking createdAt we've already seen. Used
  // only to detect genuinely new arrivals (for toasts), independent of the
  // per-booking viewed set.
  const prevMaxRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const seededRef = useRef(false);

  const persistViewed = useCallback((arr: string[]) => {
    try {
      window.localStorage.setItem(VIEWED_IDS_KEY, JSON.stringify(arr));
    } catch {
      // localStorage may be unavailable (private mode); in-session state still works.
    }
  }, []);

  const setViewed = useCallback((next: Set<string>, arr: string[]) => {
    viewedIdsRef.current = next;
    setViewedIds(next);
    persistViewed(arr);
  }, [persistViewed]);

  const fetchNotifs = useCallback(
    async (opts: { silent: boolean }) => {
      if (inFlightRef.current) return; // dedup overlapping interval + visibility fetches
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/admin/notifications", {
          headers: { "cache-control": "no-store" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as NotifResponse;
        setBookings(data.bookings);

        const listMax = data.bookings.reduce(
          (m, r) => Math.max(m, new Date(r.createdAt).getTime()),
          Number.NEGATIVE_INFINITY,
        );

        if (!seededRef.current) {
          // First ever visit: mark every current pending booking as viewed so
          // the bell starts empty — only genuinely new bookings notify.
          seededRef.current = true;
          try {
            window.localStorage.setItem(SEEDED_KEY, "1");
          } catch {
            // localStorage unavailable; in-session seeded flag still works.
          }
          const ids = data.bookings.map((r) => r.id);
          const merged = mergeViewed(
            [...viewedIdsRef.current],
            ids,
            VIEWED_IDS_CAP,
          );
          setViewed(new Set(merged), merged);
          // Baseline the toast high-water mark at "now" so existing pending
          // bookings never toast on load.
          prevMaxRef.current = Date.now();
        } else {
          // Toast genuinely new arrivals (created after the last poll's newest)
          // that the admin has not already viewed. Suppress while the dropdown
          // is open — the admin is already looking at the list.
          if (!opts.silent && !openRef.current) {
            const arrivals = newArrivals(data.bookings, prevMaxRef.current)
              .filter((r) => !viewedIdsRef.current.has(r.id));
            if (arrivals.length === 1) {
              const r = arrivals[0]!;
              toast("New booking received", {
                description: formatNotifDescription(r),
                action: { label: "View", onClick: () => router.push(pendingFocusHref(r.id)) },
              });
            } else if (arrivals.length > 1) {
              toast(`${arrivals.length} new bookings received`, {
                description: "Review them in the pending queue.",
                action: { label: "View", onClick: () => router.push(PENDING_HREF) },
              });
            }
          }
          prevMaxRef.current = Math.max(prevMaxRef.current, listMax);
          if (!Number.isFinite(prevMaxRef.current)) prevMaxRef.current = Date.now();
        }
      } catch (e) {
        // Fail silent: the bell is non-critical and must not break the admin shell.
        console.warn("[notifications] fetch failed", e);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [router, setViewed],
  );

  // Mount: load the persisted viewed set + seeded flag BEFORE the first fetch
  // (so read/unread state is correct from the first response), then fetch once.
  useEffect(() => {
    setMounted(true);
    let loadedIds: string[] = [];
    let seeded = false;
    try {
      const raw = window.localStorage.getItem(VIEWED_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          loadedIds = parsed.filter((x): x is string => typeof x === "string");
        }
      }
      seeded = window.localStorage.getItem(SEEDED_KEY) === "1";
    } catch {
      // localStorage unavailable; fall through with empty defaults.
    }
    viewedIdsRef.current = new Set(loadedIds);
    setViewedIds(new Set(loadedIds));
    seededRef.current = seeded;
    void fetchNotifs({ silent: true });
  }, [fetchNotifs]);

  // Poll + tab-focus refetch. fetchNotifs reads refs fresh, so the interval
  // does not need to re-subscribe when viewedIds/open change. The 30s poll also
  // refreshes the relative "received" timestamps by re-rendering the list.
  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => void fetchNotifs({ silent: false }), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchNotifs({ silent: false });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [mounted, fetchNotifs]);

  function handleOpenChange(nextOpen: boolean) {
    openRef.current = nextOpen;
    setOpen(nextOpen);
    // Opening the panel marks nothing read — only a row click or "Mark all
    // read" does, matching standard notification-panel behavior.
  }

  function handleRowClick(id: string) {
    // Navigation does not clear the notification; clearing is explicit.
    setOpen(false);
    router.push(pendingFocusHref(id));
  }

  function handleMarkAllRead() {
    // Explicitly clear every currently-shown notification in one shot.
    const ids = bookings.map((b) => b.id);
    if (ids.length === 0) return;
    const merged = mergeViewed([...viewedIdsRef.current], ids, VIEWED_IDS_CAP);
    setViewed(new Set(merged), merged);
  }

  function goToPending() {
    setOpen(false);
    router.push(PENDING_HREF);
  }

  const unread = mounted ? filterUnviewed(bookings, viewedIds) : [];
  const unreadCount = unread.length;
  const label = `Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="relative" />}
        aria-label={label}
      >
        <Bell className="size-5" />
        {mounted && unreadCount > 0 ? (
          <Badge
            variant="default"
            className="absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </Badge>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs font-medium">Notifications</span>
          {mounted && unreadCount > 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {unreadCount} new
              </span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>
        {loading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : unread.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 px-4 text-sm text-muted-foreground">
            <Bell className="size-5 opacity-40" />
            <span>No new bookings.</span>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto p-1">
            {unread.map((b) => (
              <DropdownMenuItem
                key={b.id}
                onClick={() => handleRowClick(b.id)}
                className="flex flex-col items-stretch gap-1 rounded-md px-2 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{b.fullName}</span>
                  <span className="whitespace-nowrap text-sm font-semibold">
                    {formatNotifTotal(b.total)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {formatNotifDate(b.date)} · {b.slotCount}{" "}
                    {b.slotCount === 1 ? "slot" : "slots"}
                  </span>
                  <span className="whitespace-nowrap">
                    {formatRelativeTime(b.createdAt, Date.now())}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <div className="border-t p-1">
          <DropdownMenuItem
            onClick={goToPending}
            className="justify-center text-xs text-muted-foreground"
          >
            View all pending
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
