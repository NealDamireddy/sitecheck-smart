#!/usr/bin/env python
"""
Mint a Supabase access token for manual API testing.

    .venv/bin/python scripts/get_token.py user@example.com password

Prints the JWT on stdout and nothing else, so it composes:

    TOKEN=$(.venv/bin/python scripts/get_token.py "$EMAIL" "$PASS")
    curl -H "Authorization: Bearer $TOKEN" ...

Reads E2E_SUPABASE_* from ../.env.test when present, otherwise
NEXT_PUBLIC_SUPABASE_* from ../.env.local — the same credentials the web app
and the E2E suite already use, so there is nothing new to configure.

The token is what the service uses to act as you: every query it runs is
scoped by the same RLS policies as the web app. It expires in an hour.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parent


def _env(*names: str) -> str | None:
    """First matching key across .env.test then .env.local."""
    for env_file in (REPO_ROOT / ".env.test", REPO_ROOT / ".env.local"):
        if not env_file.exists():
            continue
        values = {}
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip("\"'")
        for name in names:
            if values.get(name):
                return values[name]
    for name in names:
        if os.environ.get(name):
            return os.environ[name]
    return None


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    email, password = sys.argv[1], sys.argv[2]

    url = _env("E2E_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL")
    key = _env(
        "E2E_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"
    )
    if not url or not key:
        print(
            "Could not find a Supabase URL/anon key in .env.test or .env.local",
            file=sys.stderr,
        )
        return 1

    from supabase import create_client

    client = create_client(url, key)
    try:
        session = client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Sign-in failed: {exc}", file=sys.stderr)
        return 1

    if not session or not session.session:
        print("Sign-in returned no session", file=sys.stderr)
        return 1

    # stdout is the token alone so this is safe to use in $( ).
    print(session.session.access_token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
