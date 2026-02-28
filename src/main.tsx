import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "./client/trpc";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import SuperJSON from "superjson";
import { getBaseUrl } from "./lib/utils";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
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
      headers: () => ({
        "x-trpc-source": "react",
      }),
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
