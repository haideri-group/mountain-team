# syntax=docker/dockerfile:1.7
# TeamFlow staging image. Multi-stage: deps → builder → runner.
# Produces a Next.js 16 standalone server running on port 3000.

# ─── Stage 1: deps ───────────────────────────────────────────────────────────
# Install node_modules once so subsequent builds reuse the cached layer.
FROM node:24-alpine AS deps
WORKDIR /app

# Note: `libc6-compat` was removed from Alpine 3.20+ (node:24-alpine uses
# Alpine 3.23). No native glibc modules in TeamFlow's dep tree need it, so we
# don't install it. If a future dep requires glibc compat, add `gcompat`
# (the modern Alpine replacement) here.

COPY package.json yarn.lock .yarnrc.yml ./

# Yarn 4 is managed via corepack — packageManager field in package.json
# pins the exact version, so this is reproducible. No need to copy `.yarn/`
# (this project uses `nodeLinker: node-modules`, so nothing in .yarn/ is
# committed — it's just the runtime install-state cache).
RUN corepack enable \
 && corepack prepare yarn@4.13.0 --activate \
 && yarn install --immutable

# ─── Stage 2: builder ────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Build-time public env vars. Next.js bakes NEXT_PUBLIC_* into the bundle at
# build time, so they must be available here — passed from CI via --build-arg.
ARG NEXT_PUBLIC_JIRA_BASE_URL
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_JIRA_BASE_URL=$NEXT_PUBLIC_JIRA_BASE_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Placeholder DATABASE_URL. `src/lib/db/index.ts` throws at module load if the
# var isn't set; Next.js imports every route at build time for metadata
# collection, so the build would fail here. We never actually connect during
# build — just need the import to not throw. Real value is injected at runtime
# via docker-compose .env on the server.
ARG DATABASE_URL="mysql://build:build@localhost:3306/build"
ENV DATABASE_URL=$DATABASE_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable Next.js telemetry during build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable \
 && corepack prepare yarn@4.13.0 --activate \
 && yarn build

# ─── Stage 3: runner ─────────────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Yarn 4 via corepack — runs `yarn db:migrate:apply` in the migration
# one-shot container and is available for interactive debugging
# (`docker exec -it tmstage-web sh` → any yarn command).
RUN corepack enable \
 && corepack prepare yarn@4.13.0 --activate

# Non-root runtime user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output (server.js + the minimal deps it bundles
# + a stripped package.json). We overwrite the stripped package.json below
# with the real one so yarn script lookups resolve.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Full node_modules + yarn workspace metadata. Prior iterations of this
# Dockerfile cherry-picked ~10 packages to keep the image at ~40 MB, but
# every new migration that pulled in a fresh npm dep broke the deploy
# until the cherry-pick list was manually extended — and yarn script
# invocation itself failed because yarn.lock wasn't shipped. Shipping the
# full tree costs ~260 MB per unique image, but Docker layer sharing
# means the node_modules layer is reused across every deploy where
# yarn.lock is unchanged. Steady-state disk on the homelab is dominated
# by the per-deploy app-code layer (~30 MB), not this one.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
# Overrides the stripped package.json from .next/standalone so yarn can
# resolve script aliases (e.g. `yarn db:migrate:apply`).
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/yarn.lock ./yarn.lock
COPY --from=builder --chown=nextjs:nodejs /app/.yarnrc.yml ./.yarnrc.yml

# Migration + Drizzle source files (TypeScript, executed via tsx).
# src/lib/ip is a transitive import from migrate-ip-allowlist.ts — kept so
# the orchestrator can discover every historical migration without ENOENT
# even before `yarn db:migrate:baseline` has been run against a fresh DB.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db ./src/lib/db
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/ip ./src/lib/ip
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs

EXPOSE 3000

# Simple HTTP health probe against the app's /api/health route.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
