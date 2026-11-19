import { useEffect } from "react";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";

/**
 * Makes the browser tab say which app you're in. The title follows the active
 * workspace. Inventory keeps the site's default favicons (from index.html);
 * other workspaces swap in their own logo. Everything is restored on cleanup.
 */
export function useWorkspaceBranding(workspace: Workspace) {
  useEffect(() => {
    const { label, logo } = WORKSPACES[workspace];
    const previousTitle = document.title;
    document.title = `${label} · Operation Tamarin`;

    let cleanupIcon: (() => void) | undefined;
    if (workspace !== "inventory") {
      const existing = Array.from(
        document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
      );
      existing.forEach((el) => el.remove());

      const link = document.createElement("link");
      link.rel = "icon";
      link.type = "image/svg+xml";
      link.href = logo;
      document.head.appendChild(link);

      cleanupIcon = () => {
        link.remove();
        existing.forEach((el) => document.head.appendChild(el));
      };
    }

    return () => {
      cleanupIcon?.();
      document.title = previousTitle;
    };
  }, [workspace]);
}
