# SMARTS automation bot — Playwright/Chromium worker.
#
# This CANNOT run in a serverless function: it drives a real browser for
# minutes at a time. Its deployment shape is a long-lived container that
# takes one job at a time (ECS Fargate task / Azure Container App job),
# triggered by a queue message. See docs/DEPLOYMENT.md.
#
#   docker build -t sitecheck-smarts-bot smarts-automation/
#
# Resource floor (measured against the real portal flow, one job):
#   1 vCPU / 2 GB RAM. Chromium alone reserves ~512 MB, and SMARTS's
#   JSF pages are heavy. Below 2 GB the renderer gets OOM-killed
#   mid-form, which surfaces as a mysterious mid-run halt.
#
# The base image pins both Playwright and its bundled browser build —
# a floating tag would silently change Chromium under the vision layer,
# and the selectors and screenshot coordinates are calibrated to it.

FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app

ENV NODE_ENV=production \
    # Never write artifacts into the image layer; the runtime mounts a
    # volume here (screenshots, run logs, job state).
    SMARTS_ARTIFACTS_DIR=/data/artifacts \
    # Chromium in a container has no display.
    PLAYWRIGHT_HEADED=""

COPY package.json package-lock.json ./
# The bot runs from TypeScript via tsx, so dev deps are required at run
# time. `npm ci` (not --omit=dev) is deliberate.
RUN npm ci

COPY . .
RUN npx tsc -p tsconfig.json --noEmit

# The Playwright base image ships a non-root `pwuser`. Chromium's sandbox
# is LEFT ENABLED — the common `--no-sandbox` workaround is a real
# weakening, and this container loads pages from a government portal.
# Running as non-root with the default seccomp profile is sufficient;
# if your orchestrator's profile blocks user namespaces, fix the profile
# rather than disabling the sandbox.
RUN mkdir -p /data/artifacts && chown -R pwuser:pwuser /data /app
USER pwuser

# No HEALTHCHECK: this is a batch worker, not a service. Liveness is the
# process exiting; the orchestrator reports the exit code, and the job
# store (smarts_runs) is the durable record of what happened.

ENTRYPOINT ["npx", "tsx", "src/orchestrator/cli.ts"]
