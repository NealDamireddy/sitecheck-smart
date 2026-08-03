#!/usr/bin/env python
"""
End-to-end proof of the upload path, against real infrastructure.

    .venv/bin/python scripts/e2e_upload.py

Real Supabase (so real RLS), real Anthropic, in-memory Qdrant. No server
process: FastAPI's TestClient drives the ASGI app directly and runs background
tasks to completion before returning, which is exactly the ordering we want to
assert on.

Requires ../.env.test with the two seeded E2E users and their projects
(`npm run db:seed:test`), plus migration 016 applied.

It answers three questions, in order of how much they matter:

  1. Does an upload actually produce BMPs in Postgres?
  2. Can the assistant retrieve from the indexed document?
  3. Can user B reach user A's SWPPP?  ← the one that must be "no"
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parent
sys.path.insert(0, str(SERVICE_ROOT))

# httpx logs every request at INFO and the app logs in JSON; both drown the
# check output. Warnings and errors still surface.
import logging  # noqa: E402

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

BOLD, DIM, GREEN, RED, YELLOW, RESET = (
    "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m",
)


def load(env_file: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                values[k.strip()] = v.strip().strip("\"'")
    return values


TEST_ENV = load(REPO_ROOT / ".env.test")
LOCAL_ENV = load(REPO_ROOT / ".env.local")

# The service authenticates as the caller; anon key only, never service-role.
#
# .env.test deliberately carries only E2E_SUPABASE_SERVICE_ROLE_KEY — the seed
# script needs it to create users. This service must never see it (Settings
# rejects a service-role key outright), so the anon key comes from .env.local.
# Both files point at the same throwaway project, so this is the same database.
os.environ["SUPABASE_URL"] = TEST_ENV.get("E2E_SUPABASE_URL") or LOCAL_ENV.get(
    "NEXT_PUBLIC_SUPABASE_URL", ""
)
os.environ["SUPABASE_ANON_KEY"] = TEST_ENV.get(
    "E2E_SUPABASE_ANON_KEY"
) or LOCAL_ENV.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
os.environ["ANTHROPIC_API_KEY"] = LOCAL_ENV.get("ANTHROPIC_API_KEY", "")
os.environ["QDRANT_URL"] = ":memory:"

PASS, FAIL = f"{GREEN}PASS{RESET}", f"{RED}FAIL{RESET}"
_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{PASS if ok else FAIL}] {label}" + (f" {DIM}{detail}{RESET}" if detail else ""))
    if not ok:
        _failures.append(label)
    return ok


def token_for(email: str, password: str) -> str:
    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    session = client.auth.sign_in_with_password({"email": email, "password": password})
    return session.session.access_token


def main() -> int:
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "ANTHROPIC_API_KEY") if not os.environ.get(k)]
    if missing:
        print(f"{RED}Missing config: {', '.join(missing)}{RESET}")
        print(f"{DIM}Need ../.env.test (E2E_SUPABASE_*) and ../.env.local (ANTHROPIC_API_KEY).{RESET}")
        return 1

    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    pdf = (SERVICE_ROOT / "fixtures" / "sample_swppp.pdf").read_bytes()

    project_a = TEST_ENV.get("E2E_USER_A_PROJECT_ID", "e2e-project-a")
    print(f"\n{BOLD}Signing in{RESET}")
    token_a = token_for(TEST_ENV["E2E_USER_A_EMAIL"], TEST_ENV["E2E_USER_A_PASSWORD"])
    token_b = token_for(TEST_ENV["E2E_USER_B_EMAIL"], TEST_ENV["E2E_USER_B_PASSWORD"])
    auth_a = {"Authorization": f"Bearer {token_a}"}
    auth_b = {"Authorization": f"Bearer {token_b}"}
    print(f"  {DIM}user A and user B tokens acquired{RESET}")

    # ── 1. Unauthenticated ──────────────────────────────────────────────────
    print(f"\n{BOLD}1. Unauthenticated access{RESET}")
    r = client.post(f"/api/v1/projects/{project_a}/swppp",
                    files={"file": ("s.pdf", pdf, "application/pdf")})
    check("upload without a token is refused", r.status_code == 401, f"→ {r.status_code}")

    # ── 2. Upload ───────────────────────────────────────────────────────────
    print(f"\n{BOLD}2. Upload as user A{RESET}")
    started = time.time()
    r = client.post(f"/api/v1/projects/{project_a}/swppp", headers=auth_a,
                    files={"file": ("sample_swppp.pdf", pdf, "application/pdf")})
    if not check("upload accepted", r.status_code == 202, f"→ {r.status_code} {r.text[:120]}"):
        return 1
    document_id = r.json()["document_id"]
    print(f"  {DIM}document {document_id} · pipeline ran in {time.time()-started:.1f}s{RESET}")

    # TestClient runs BackgroundTasks before returning, so status is terminal.
    r = client.get(f"/api/v1/projects/{project_a}/swppp/{document_id}", headers=auth_a)
    doc = r.json() if r.status_code == 200 else {}
    check("status is completed", doc.get("status") == "completed",
          f"→ {doc.get('status')} {doc.get('error_message') or ''}")
    check("all 10 BMPs stored", doc.get("bmp_count") == 10, f"→ bmp_count={doc.get('bmp_count')}")

    # ── 3. Rows actually landed, under RLS ──────────────────────────────────
    print(f"\n{BOLD}3. Data in Postgres{RESET}")
    from supabase import create_client

    db_a = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    db_a.postgrest.auth(token_a)
    drafts = db_a.table("bmp_checkpoint_drafts").select("*").eq("document_id", document_id).execute()
    check("10 draft rows readable by owner", len(drafts.data) == 10, f"→ {len(drafts.data)}")
    if drafts.data:
        multi = [d for d in drafts.data if len(d.get("inspection_frequency") or []) > 1]
        check("multi-trigger frequencies preserved", len(multi) >= 2,
              f"→ {len(multi)} rows with >1 trigger")
        se10 = next((d for d in drafts.data if d["bmp_code"] == "SE-10"), None)
        check("SE-10 kept all 3 triggers",
              bool(se10) and len(se10["inspection_frequency"]) == 3,
              f"→ {se10['inspection_frequency'] if se10 else 'missing'}")

    # ── 4. Retrieval ────────────────────────────────────────────────────────
    print(f"\n{BOLD}4. Vector search (in-memory Qdrant){RESET}")
    r = client.get(f"/api/v1/projects/{project_a}/swppp/search",
                   headers=auth_a, params={"q": "What is the spill response procedure?"})
    if check("search returns 200", r.status_code == 200, f"→ {r.status_code}"):
        body = r.json()
        check("sources retrieved", len(body["sources"]) > 0, f"→ {len(body['sources'])} chunks")
        check("answer is grounded", len(body["answer"]) > 20)
        print(f"  {DIM}{body['answer'][:150]}{RESET}")

    # ── 5. Tenant isolation — the one that matters ──────────────────────────
    print(f"\n{BOLD}5. Tenant isolation (user B against user A's project){RESET}")
    r = client.get(f"/api/v1/projects/{project_a}/swppp/{document_id}", headers=auth_b)
    check("B cannot read A's document", r.status_code == 404, f"→ {r.status_code}")

    r = client.get(f"/api/v1/projects/{project_a}/swppp/search",
                   headers=auth_b, params={"q": "spill response"})
    check("B cannot search A's SWPPP", r.status_code == 404, f"→ {r.status_code}")

    r = client.post(f"/api/v1/projects/{project_a}/swppp", headers=auth_b,
                    files={"file": ("x.pdf", pdf, "application/pdf")})
    check("B cannot upload into A's project", r.status_code == 404, f"→ {r.status_code}")

    db_b = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    db_b.postgrest.auth(token_b)
    leaked = db_b.table("bmp_checkpoint_drafts").select("id").eq("document_id", document_id).execute()
    check("RLS hides A's drafts from B directly", len(leaked.data) == 0, f"→ {len(leaked.data)} rows")

    # ── Cleanup ─────────────────────────────────────────────────────────────
    db_a.table("swppp_documents").delete().eq("id", document_id).execute()

    print("\n" + "─" * 60)
    if _failures:
        print(f"{RED}{BOLD}{len(_failures)} check(s) failed:{RESET}")
        for f in _failures:
            print(f"  · {f}")
        return 1
    print(f"{GREEN}{BOLD}Upload path works end to end, and tenant isolation holds.{RESET}\n")
    return 0


if __name__ == "__main__":
    code = main()
    # The in-memory Qdrant client closes its transport during interpreter
    # shutdown, after the event loop is gone, which prints a harmless
    # "Event loop is closed" traceback AFTER every check has already run.
    # Flush and exit hard so that noise cannot be mistaken for a failure.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
