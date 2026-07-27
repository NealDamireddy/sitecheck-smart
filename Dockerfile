# SiteCheck web application — portable container image.
#
# Multi-stage so the runtime layer carries no toolchain and no source:
# only Next.js's standalone output (see next.config.ts `output`).
#
#   docker build -t sitecheck-web \
#     --build-arg APP_COMMIT_SHA=$(git rev-parse --short HEAD) .
#
# NOTE on build args: NEXT_PUBLIC_* values are inlined into the CLIENT
# bundle at build time, so they must be present during `next build` and
# are baked into the image — meaning an image built for one Supabase
# project cannot be repointed at another by changing env at run time.
# Only genuinely public values may be passed this way. Server-only
# secrets (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, …) are read at
# RUNTIME and must never be build args: a build arg is recoverable from
# image history.

# ── deps ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_MAPBOX_TOKEN
ARG APP_COMMIT_SHA=unknown
ARG APP_BUILD_TIME=unknown
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    APP_COMMIT_SHA=$APP_COMMIT_SHA \
    APP_BUILD_TIME=$APP_BUILD_TIME \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# wget is used by HEALTHCHECK; it is in busybox on alpine already.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# standalone/ contains the server plus only the modules it actually uses.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Liveness only (`shallow=1`): a database blip must not restart otherwise
# healthy containers. Readiness (full dependency check) belongs on the
# load balancer's target-group probe against /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health?shallow=1 || exit 1

CMD ["node", "server.js"]
