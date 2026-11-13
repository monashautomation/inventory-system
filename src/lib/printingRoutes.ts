/** Canonical URLs for the Printing workspace. */
export const PRINTING_ROUTES = {
  root: "/printing",
  send: "/printing/send",
  queue: "/printing/queue",
  monitor: "/printing/monitor",
  cameras: "/printing/cameras",
  stats: "/printing/stats",
  history: "/printing/history",
  printers: "/printing/printers",
} as const;

/**
 * Legacy top-level print URLs, kept permanently so bookmarks, Discord links
 * and kiosk shortcuts keep working. Each maps to its /printing/* replacement.
 */
export const LEGACY_PRINT_REDIRECTS: Record<string, string> = {
  "/print": PRINTING_ROUTES.send,
  "/print-queue": PRINTING_ROUTES.queue,
  "/print-monitor": PRINTING_ROUTES.monitor,
  "/print-cam": PRINTING_ROUTES.cameras,
  "/print-stats": PRINTING_ROUTES.stats,
  "/print-history": PRINTING_ROUTES.history,
  "/printer-management": PRINTING_ROUTES.printers,
};

export function isPrintingPath(pathname: string): boolean {
  return pathname === "/printing" || pathname.startsWith("/printing/");
}

/** Sections shown in the Printing tab strip, in display order. */
export const PRINTING_TABS = [
  { title: "Overview", url: PRINTING_ROUTES.root },
  { title: "Monitor", url: PRINTING_ROUTES.monitor },
  { title: "Queue", url: PRINTING_ROUTES.queue },
  { title: "Send G-code", url: PRINTING_ROUTES.send },
  { title: "Cameras", url: PRINTING_ROUTES.cameras },
  { title: "History", url: PRINTING_ROUTES.history },
  { title: "Stats", url: PRINTING_ROUTES.stats },
  { title: "Printers", url: PRINTING_ROUTES.printers },
] as const;
