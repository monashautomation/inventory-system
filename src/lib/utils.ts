import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }

  const truncated = `${str.slice(0, maxLength)}...`;
  return truncated;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getBaseUrl = () => {
  // Check if we're in a browser environment
  const g = globalThis as Record<string, unknown>;
  if (
    typeof g.window === "object" &&
    g.window !== null &&
    typeof (g.window as Record<string, unknown>).location === "object"
  ) {
    return (
      (g.window as Record<string, unknown>).location as { origin: string }
    ).origin;
  }
  if (process.env.FRONTEND_URL) return `${process.env.FRONTEND_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
};
