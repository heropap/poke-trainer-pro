# ── Stage 1: Dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies only when package files change
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ───────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY app/ .

# Build arguments for build-time env
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}

# Build Next.js (standalone output)
RUN npm run build

# ── Stage 3: Production runner ───────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: run as non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy server.ts dependencies (custom WebSocket server)
# The standalone output already includes compiled Next.js,
# but our custom server.ts needs to be handled separately.
# For production, we use Next.js standalone server directly.
# WebSocket server should be deployed as a separate service or
# the custom server should be compiled and included.

# Copy card data for runtime
COPY --from=builder /app/src/data ./src/data

# Set correct ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start Next.js standalone server
CMD ["node", "server.js"]
