# smarts-automation

Standalone TypeScript module that automates data entry into California's
SMARTS Ad Hoc Monitoring portal. The bot fills the form and stops before
the legal certification step. The certification button is always clicked
by a human — never by this code.

## Credentials policy (do not violate)

- **Never commit credentials to this repository.** No usernames, no
  passwords, no shared accounts, no examples that look like real values.
- Credentials are supplied **at runtime only**, via:
  1. Environment variables `SMARTS_USERNAME` and `SMARTS_PASSWORD`, or
  2. Interactive CLI prompt (password input is hidden).
- Credentials are never persisted: not to disk, not to logs, not to
  screenshots intentionally, and never to the configured Playwright
  storage state.
- If you accidentally commit a credential, treat it as compromised:
  rotate it immediately at `https://smarts.waterboards.ca.gov/`, then
  scrub history.
- Do not add `.env` files containing real credentials to the repo. If a
  local `.env` is used for development, it must remain untracked
  (already covered by `.gitignore`).

## Phase 2 entry point

```bash
SMARTS_USERNAME=your-user SMARTS_PASSWORD=your-pass \
  npx tsx src/auth/create-session.ts
```

On success: the script logs in, confirms the post-login banner, saves a
screenshot to `artifacts/session-result.png` (relative to the module
root), and exits 0. On failure: it halts with
`Authentication failed — check credentials`, saves a screenshot to the
same path, and exits 1. There are **no retries** — repeated wrong
attempts can lock the SMARTS account.

Set `PLAYWRIGHT_HEADED=1` to watch the browser locally.
