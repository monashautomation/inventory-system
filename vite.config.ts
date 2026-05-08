import { defineConfig } from 'vitest/config';
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths'
export default defineConfig({
    preview: {
        allowedHosts: true,
        proxy: {
            '/api': 'http://localhost:3000',
            '/mcp': 'http://localhost:3000',
            '/metrics': 'http://localhost:3000'
        },
    },
    server: {
        proxy: {
            '/api': 'http://localhost:3000',
            '/mcp': 'http://localhost:3000',
            '/metrics': 'http://localhost:3000'
        },
    },
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return;
            if (id.includes("@langchain") || id.includes("langchain")) return "ai";
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("@zxing")) return "qr-scanner";
            if (id.includes("react-markdown") || id.includes("remark") || id.includes("rehype") || id.includes("unified") || id.includes("vfile") || id.includes("mdast") || id.includes("hast")) return "markdown";
            if (id.includes("/zod/") || id.includes("/zod@")) return "zod";
            if (id.includes("react-router")) return "router";
            if (id.includes("@tanstack")) return "tanstack";
            if (id.includes("@trpc")) return "trpc";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("better-auth") || id.includes("@daveyplate")) return "auth";
            if (id.includes("react-icons") || id.includes("lucide-react") || id.includes("simple-icons")) return "icons";
            if (id.includes("mqtt") || id.includes("@modelcontextprotocol") || id.includes("mcp-use") || id.includes("@hono")) return "server-libs";
            if (id.includes("@emotion")) return "emotion";
            if (id.includes("/effect/") || id.includes("/effect@")) return "effect";
            if (id.includes("js-tiktoken") || id.includes("tiktoken")) return "tiktoken";
            if (id.includes("/rxjs/") || id.includes("/rxjs@")) return "rxjs";
            if (id.includes("es-toolkit")) return "es-toolkit";
            if (id.includes("qrcode")) return "qr-gen";
            return "vendor";
          },
        },
      },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    test: {
        environment: 'jsdom', // For React or DOM-based tests
        globals: true, // Enables Jest-like globals (e.g., describe, it, expect)
        setupFiles: './src/tests/vitest.setup.ts', // Optional: For global test setup
    },
});
