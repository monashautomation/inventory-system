import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "./client/trpc";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import SuperJSON from "superjson";
import { getBaseUrl } from "./lib/utils";
import { loadToken } from "./lib/kiosk-crypto";
import type { AppRouter } from "@/server/api/routers/_app";

function redirectToLogin() {
  if (!window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof TRPCClientError<AppRouter> &&
    error.data?.code === "UNAUTHORIZED"
  );
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) redirectToLogin();
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        retry: (failureCount, error) => {
          if (isUnauthorized(error)) return false;
          return failureCount < 3;
        },
      },
      mutations: {
        onError: (error) => {
          if (isUnauthorized(error)) redirectToLogin();
        },
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;
function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  } else {
    browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

const queryClient = getQueryClient();
const trpcClient = trpc.createClient({
  links: [
    // loggerLink({
    //     enabled: (op) =>
    //         process.env.NODE_ENV === 'development' ||
    //         (op.direction === 'down' && op.result instanceof Error)
    // }),
    httpBatchLink({
      transformer: SuperJSON,
      url: getBaseUrl() + "/api/trpc",
      headers: async () => {
        const headers: Record<string, string> = { "x-trpc-source": "react" };
        if (window.location.pathname.startsWith("/kiosk")) {
          const kioskToken = await loadToken();
          if (kioskToken) headers["x-kiosk-token"] = kioskToken;
        }
        return headers;
      },
      fetch: (url, options) =>
        fetch(url, { ...options, credentials: "include" }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </StrictMode>,
);
