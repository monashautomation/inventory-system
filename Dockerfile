# Stage 1: Build the app
FROM oven/bun:1-alpine AS builder

WORKDIR /app
RUN apk update && apk add python3 openssl make --no-cache
# Copy package files and install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and pre-generated Prisma client
COPY . .

# Build the app (if needed; Bun handles TypeScript natively, so no explicit build step for server)
# For client-side React, bundle if necessary (example for a simple SPA)
COPY tsconfig.json .
COPY tsconfig.app.json .
COPY tsconfig.node.json .
RUN bunx prisma generate
RUN bun run build

# Stage 2: Create production image
FROM oven/bun:1-alpine

WORKDIR /app

# curl is required at runtime for Bambu printer FTPS uploads
RUN apk add --no-cache curl

# Copy only necessary files from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/tsconfig*.json .
COPY --from=builder /app/vite.config.ts .
COPY package.json .

# Expose port
EXPOSE 4173

# Set environment (adjust DATABASE_URL in your deployment)
ENV NODE_ENV=production

# Start the server
CMD ["/bin/sh", "-c", "bunx prisma db push && bun run start"]
