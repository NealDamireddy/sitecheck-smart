# SiteCheck — Deployment and Cloud Portability

Two runnable paths (AWS and Azure), plus an honest account of what breaks on day one. Nothing here has been executed against a real cloud account — these are derived from the code as it stands, and the "what will bite you" sections are the parts to read carefully.

---

## 1. Where the lock-in actually is

The audit turned up **less Vercel coupling than expected**. There are no `@vercel/*` packages, no edge-runtime routes, no ISR, no Vercel KV or Blob, and no `VERCEL_*` variables read anywhere in `src/`. The entire Vercel surface is:

| Coupling | Where | Portable replacement |
|---|---|---|
| Cron schedule | `vercel.json` (`0 14 * * *` → `/api/cron/pre-storm-detector`) | EventBridge Scheduler / Azure Container Apps job. Keep the `Authorization: Bearer $CRON_SECRET` contract — it is platform-neutral. |
| Build & host | Vercel project settings | `Dockerfile` (multi-stage, standalone output, non-root, healthcheck). |
| Image optimization | Next.js default loader | Works unchanged in a container; `next.config.ts` now derives the Supabase remote pattern from the configured URL instead of a hardcoded host. |

**The real lock-in is Supabase, not Vercel** — and it is deeper than it looks, because Supabase is four products here: Postgres, Auth, Storage, and PostgREST. See §5.

### Runtime assumptions that matter

- **`src/lib/smarts/sync-job.ts` writes to the local filesystem** (`smarts-automation/artifacts/sync-jobs/*.json|.log|.csv`) and spawns a detached child process. This is correct today (single box) and **fatal on serverless**: no writable persistent disk, no long-lived process. It is the reason the bot is a separate container. The job-store shape was deliberately written to be the same thing a queue would persist.
- **`src/lib/rate-limit.ts` holds counters in process memory.** With more than one replica, each gets its own bucket, so the effective limit multiplies by the replica count. Swap the store for Redis/ElastiCache before scaling out (the interface is already isolated).
- **NOAA and Supabase caches are per-process `Map`s.** Harmless — worst case is a few extra upstream calls per replica.

### Configuration

Every environment-dependent value is read from `process.env` and documented in `.env.example`. **There is no fail-fast validation at boot** — a missing `SMARTS_CREDENTIALS_KEY` surfaces as a runtime error the first time an inspector saves credentials, not at startup. Adding a Zod-parsed `env.ts` is a small, high-value change (tracked in `docs/FOLLOW_UP.md`); until then, the first deploy to a new environment should hit `/api/health` **and** exercise one SMARTS credential save.

---

## 2. Local: the whole stack in one command

```bash
cp .env.example .env    # fill in a DEVELOPMENT Supabase project
docker compose up --build
```

App on `http://localhost:3000`; `/api/health` reports database reachability. The bot is built but not started — it is a batch worker:

```bash
docker compose run --rm smarts-bot /data/jobs/<job>.csv
```

Compose does not run Postgres: auth, RLS, storage and the database are one hosted product here. Point it at a dev Supabase project, never production.

---

## 3. AWS path

| Concern | Service | Notes |
|---|---|---|
| Web app | **App Runner** (simplest) or **ECS Fargate** behind an ALB | App Runner reads the health check natively; ECS gives you finer control. Image from `Dockerfile`. |
| SMARTS bot | **ECS Fargate task**, queue-triggered | 1 vCPU / 2 GB minimum — see §6. |
| Job queue | **SQS** + a small Lambda that calls `RunTask` | Visibility timeout > max run (15 min is safe). |
| Dead letters | **SQS DLQ**, `maxReceiveCount: 2` | A bot job that fails twice is a human problem, not a retry problem. |
| Artifacts | **EFS** mounted at `/data/artifacts`, or S3 sync on exit | Screenshots are evidence — they must outlive the task. |
| Object storage | Supabase Storage (keep) or **S3** | Swap seam in §5. |
| Secrets | **Secrets Manager** → task-definition secrets | Never build args. |
| Cron | **EventBridge Scheduler** → HTTPS with the `CRON_SECRET` bearer header | Replaces `vercel.json`. |
| Logs | stdout → **CloudWatch Logs** | Already JSON; set a metric filter on `{ $.level = "error" }`. |
| Database | Supabase (keep) or **RDS Postgres** + a new auth stack (§5) | |

Deployment steps:

```bash
# 1. Build and push
aws ecr create-repository --repository-name sitecheck-web
docker build -t sitecheck-web \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --build-arg APP_COMMIT_SHA=$(git rev-parse --short HEAD) .
docker tag sitecheck-web:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/sitecheck-web:latest
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/sitecheck-web:latest

# 2. Same for the bot
docker build -t sitecheck-smarts-bot smarts-automation/

# 3. Health check path for the ALB target group
#    /api/health          (readiness — checks the database)
#    /api/health?shallow=1 (liveness — process only)
```

**Because `NEXT_PUBLIC_*` values are baked into the client bundle at build time, one image is bound to one Supabase project.** Staging and production need separate builds. This surprises people who expect to repoint a container with environment variables.

---

## 4. Azure path

| Concern | Service | Notes |
|---|---|---|
| Web app | **Container Apps** | Scale-to-zero is fine for the web tier; it is stateless. |
| SMARTS bot | **Container Apps Job** (event-driven, KEDA on queue length) | Cleanest fit of any option here — the job model matches a bot run exactly. |
| Job queue | **Azure Storage Queue** or Service Bus | KEDA scales the job from queue depth. |
| Artifacts | **Azure Files** mounted at `/data/artifacts` | |
| Secrets | **Key Vault** + managed identity | |
| Cron | **Container Apps Job** on a cron trigger, or Logic Apps | Same bearer-token contract. |
| Logs | stdout → **Log Analytics** | Query: `ContainerAppConsoleLogs_CL \| where Log_s has '"level":"error"'`. |
| Registry | **ACR** | |

```bash
az containerapp create \
  --name sitecheck-web --resource-group sitecheck \
  --image $ACR.azurecr.io/sitecheck-web:latest \
  --target-port 3000 --ingress external \
  --min-replicas 1 --max-replicas 3
```

Set the health probe to `/api/health?shallow=1` for liveness and `/api/health` for readiness.

---

## 5. What breaks if you leave Supabase

This is the section that matters. **Postgres is portable; the rest of Supabase is not.**

**RLS depends on `auth.uid()`**, a Supabase Auth function that reads the JWT the client presents. Every policy in `supabase/migrations/008_auth_rls.sql` and `009_smarts.sql` is written against it, via `auth_user_org_ids()`. Move auth to Cognito or Entra ID and **every policy stops working** — not "degrades", stops: `auth.uid()` returns null, so `project_id IN (SELECT auth_user_project_ids())` matches nothing and the app goes blank.

Re-expressing them means either:

1. **Keep a JWT contract.** Have the new IdP mint tokens Postgres can read, and reimplement `auth.uid()` as a function over `current_setting('request.jwt.claims')`. Preserves the policies almost verbatim — the least-bad option, and it requires PostgREST or an equivalent that sets that GUC per request.
2. **Move enforcement into the application.** Delete RLS and make every query filter by org. This is a large, permanent increase in risk surface: today a route that forgets a filter returns nothing; afterwards it returns everyone's data. Given this is a legal-record system with a tenant-isolation guarantee, **I would not recommend this.**

Also moving with auth: the signup trigger (`handle_new_user`, migration 012) that provisions an org and membership, and `qsp_profiles` / `smarts_credentials` / `smarts_runs`, which are keyed on `auth.users(id)` with `ON DELETE CASCADE`.

**Storage has a real seam.** `src/lib/supabase/storage.ts` is the only module that touches object storage, and reads already go through `resolveCheckpointPhotoUrl()`. To swap in S3 or Blob you reimplement four functions (`uploadCheckpointPhoto`, `resolveCheckpointPhotoUrl`, `uploadMissionPhoto`, `deleteMissionPhoto`) and migrate the objects. The stored values are full URLs, so a migration must rewrite `checkpoints.qsp_photo_url` — or, better, switch to storing bare object paths first (`checkpointPhotoPathFromUrl` already handles both).

**Honest estimate:** app + bot to AWS or Azure, keeping Supabase — a few days, mostly IAM and queue wiring. Leaving Supabase Auth as well — several weeks, and it is a rewrite of the security model rather than a migration. If procurement demands data residency, check whether a Supabase region satisfies it before committing to that.

---

## 6. The bot's deployment shape

Not negotiable: **Playwright cannot run in a serverless function.** Chromium needs a writable filesystem, ~2 GB RAM, and minutes of wall time.

- **Image:** `mcr.microsoft.com/playwright:v1.50.0-jammy`, pinned. A floating tag changes Chromium under the vision layer, whose selectors and screenshot coordinates are calibrated to a specific build.
- **Resources:** 1 vCPU / 2 GB RAM floor. Below that the renderer is OOM-killed mid-form and it looks like a mysterious halt.
- **`shm_size: 1gb`** — Docker's 64 MB default crashes Chromium on heavy pages, and SMARTS's JSF pages are heavy.
- **Concurrency: 1 per user.** SMARTS is a stateful session-based portal; two concurrent runs on one account will corrupt each other's draft. Enforce with a queue `MessageGroupId` (SQS FIFO) or a per-user lock.
- **Timeout:** 15 minutes hard. A run that hasn't reached the certification screen by then is stuck.
- **Dead letter after 2 attempts.** Never retry blindly — a partially-filled Ad Hoc report left in SMARTS needs a human to look at it.
- **Sandbox stays on.** The usual `--no-sandbox` fix is a genuine weakening and this container loads a government portal. Run as the image's non-root `pwuser`; if your orchestrator's seccomp profile blocks user namespaces, fix the profile.
- **The certification invariant travels with it.** Three independent guards (orchestrator never navigates past certification; the vision executor hard-stops on certify/attest controls; the log parser rejects any run claiming a certified state). Any deployment change must keep all three.

---

## 7. First-deploy checklist

- [ ] `/api/health` returns 200 with `dependencies.database.status: "ok"`.
- [ ] `/api/health` reports the expected `version.commit`.
- [ ] Sign up, confirm the email, sign in. **Verify the Supabase Site URL** — a wrong one sends confirmation and password-reset links to the old host.
- [ ] Save SMARTS credentials, then reload the account page (proves `SMARTS_CREDENTIALS_KEY` is set and stable).
- [ ] Trigger the cron endpoint manually with the bearer token; confirm 200 and a log line.
- [ ] Run one bot job end to end and confirm it **stops at certification**.
- [ ] Confirm logs arrive as parsed JSON, and set an alert on `level:"error"`.
- [ ] Confirm `checkpoint-photos` is **private** (SEC-01) and photos still render via signed URLs.
- [ ] Run `docs/QA_CHECKLIST.md` against the new environment.

## 8. Rollback

Images are immutable and tagged by commit. Roll back by redeploying the previous tag — no build required. **Migrations do not roll back**: `supabase/migrations/` is forward-only and there are no `down` scripts, so a schema change plus a bad deploy means rolling the image back to a version compatible with the *new* schema. Keep migrations additive (this repo's convention) so the previous image keeps working against the newer database.
