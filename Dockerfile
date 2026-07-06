# syntax=docker/dockerfile:1.7
# =============================================================================
# SGTX Platform — Production Dockerfile
# Multi-stage build for Next.js 16 (standalone output) on Bun 1.1
# Stages:  deps → builder → runner
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1 — deps
#   Install ALL dependencies (incl. dev) with a frozen lockfile for reproducible
#   builds. Dev deps are needed in the builder stage (tsc, eslint, prisma).
# -----------------------------------------------------------------------------
FROM oven/bun:1.1 AS deps
WORKDIR /app

# Copy manifests first to maximise Docker layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# -----------------------------------------------------------------------------
# Stage 2 — builder
#   Copy source, generate the Prisma client (must run BEFORE `next build` so
#   the standalone tracer can include @prisma/client + generated runtime),
#   then produce the Next.js standalone output.
# -----------------------------------------------------------------------------
FROM oven/bun:1.1 AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client into node_modules/.prisma + node_modules/@prisma/client
RUN bunx prisma generate

# Build Next.js (standalone output — see next.config.ts `output: "standalone"`)
RUN bun run build

# -----------------------------------------------------------------------------
# Stage 3 — runner
#   Minimal production image. Carries ONLY:
#     • Next.js standalone server (.next/standalone — includes a traced,
#       production-only node_modules)
#     • Static assets (.next/static, public/)
#     • Prisma generated client (not traced by Next.js standalone)
#   Runs as non-root user `bun` (UID 1000, shipped by the oven/bun base image).
# -----------------------------------------------------------------------------
FROM oven/bun:1.1-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Defensive: ensure a non-root `bun` user exists (the oven/bun image ships one
# with UID 1000; if a future base image drops it, create it here).
RUN set -eux; \
    if ! id -u bun >/dev/null 2>&1; then \
      addgroup --system --gid 1000 bun && \
      adduser --system --uid 1000 --ingroup bun --home /app bun; \
    fi; \
    mkdir -p /app; chown -R bun:bun /app

# --- Next.js standalone server (includes traced production node_modules) ---
COPY --from=builder --chown=bun:bun /app/.next/standalone ./
# --- Static assets (not embedded in standalone by default) ---
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static
COPY --from=builder --chown=bun:bun /app/public ./public
# --- Prisma generated client (runtime-loaded, not traced by Next.js) ---
COPY --from=builder --chown=bun:bun /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=bun:bun /app/node_modules/@prisma ./node_modules/@prisma

USER bun

EXPOSE 3000

# Healthcheck: hit the readiness endpoint. `bun -e` is available in the slim
# image and avoids a curl/wget dependency.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||'3000')+'/api/sgtx/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["bun", "server.js"]
