import { useEffect } from "react";
import { WORKSPACES, type Workspace } from "@/lib/workspaces";

/**
 * Makes the browser tab say which app you're in: title and favicon follow the
 * active workspace. Restores the original favicons when unmounted.
 */
export function useWorkspaceBranding(workspace: Workspace) {
  useEffect(() => {
    const { label, logo } = WORKSPACES[workspace];
    const previousTitle = document.title;
    document.title = `${label} · Operation Tamarin`;

    const existing = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'),
    );
    existing.forEach((el) => el.remove());

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = logo;
    document.head.appendChild(link);

    return () => {
      link.remove();
      existing.forEach((el) => document.head.appendChild(el));
      document.title = previousTitle;
    };
  }, [workspace]);
}
