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

# Yarn 4 via corepack — needed at runtime so `yarn db:migrate:apply` works
# inside the one-shot migration container the deploy workflow runs.
RUN corepack enable \
 && corepack prepare yarn@4.13.0 --activate

# Non-root runtime user.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output includes a minimal server.js + only the node_modules it actually needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Scripts + tsx runtime — needed so `docker compose exec web yarn db:migrate:apply`
# works at deploy time. Copy the TS sources + the tsx binary from deps.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db ./src/lib/db
# Historical migrate-ip-allowlist.ts imports `../src/lib/ip/match` (which pulls
# in ipaddr.js). Copied defensively so migrate-all can load the module even if
# the user forgot to run `yarn db:migrate:baseline` against the staging DB —
# without this, tsx crashes at import time before idempotency checks can skip.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/ip ./src/lib/ip
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json
# Cherry-picked runtime deps for scripts/migrate-all.ts + its transitive needs.
# Rule of thumb: if a new migration script imports a package, add it here.
# Intentional lean-image tradeoff — full node_modules is ~300 MB vs ~40 MB here.
# Alternative: drop this entire cherry-pick and `COPY --from=builder /app/node_modules`
# if the maintenance cost outweighs the size saving.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
# tsx's direct runtime dependencies
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@esbuild ./node_modules/@esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/get-tsconfig ./node_modules/get-tsconfig
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/resolve-pkg-maps ./node_modules/resolve-pkg-maps
# Migration-script deps
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mysql2 ./node_modules/mysql2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ipaddr.js ./node_modules/ipaddr.js

USER nextjs

EXPOSE 3000

# Simple HTTP health probe against the app's /api/health route.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
