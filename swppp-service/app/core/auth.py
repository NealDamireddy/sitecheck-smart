"""
Authentication and tenant scoping.

THE SECURITY MODEL, in one sentence: this service authenticates as the calling
user and lets Postgres RLS decide what they can see — it never holds a
credential that can bypass a policy.

Why this file exists at all: the original draft exposed

    GET /api/v1/sites/{site_id}/swppp-search

with no auth dependency, and filtered Qdrant by that path parameter. The
comment claimed the filter prevented cross-tenant leakage. It did not — the
value was supplied by the caller, so iterating `site_id` returned every
customer's SWPPP text. Qdrant has no RLS to fall back on, so in the vector
path that filter is the *entire* boundary. Filtering by an attacker-controlled
identifier is not an access control.

Two rules follow, and everything else here enforces them:

  1. The tenant is derived from the verified JWT, never from the URL.
  2. Before anything is read out of Qdrant, Postgres must confirm — under RLS,
     as the caller — that the project is visible to them. Postgres stays the
     single authority for tenant boundaries, including for vector search.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from supabase import Client, create_client

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class Caller:
    """An authenticated user plus an RLS-scoped database handle."""

    user_id: str
    #: Carries the caller's JWT. Every query through it is subject to the same
    #: policies as the Next.js app — `auth.uid()` resolves to `user_id`.
    db: Client

    async def assert_project_access(self, project_id: str) -> None:
        """
        Confirm this caller may see `project_id`, or raise 404.

        Delegates the decision to Postgres: the SELECT runs under RLS, so a
        project belonging to another organization returns zero rows exactly as
        it would in the web app. This is the gate that must pass before any
        Qdrant query — it is what stops the vector store from becoming a way
        to read around RLS.

        404 rather than 403 on purpose: a 403 would confirm the project exists.
        """
        result = (
            self.db.table("projects").select("id").eq("id", project_id).execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
            )


def _bearer_token(request: Request) -> str:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token.strip()


async def require_caller(
    request: Request, settings: Settings = Depends(get_settings)
) -> Caller:
    """
    FastAPI dependency. Every data-touching route MUST depend on this.

    `tests/test_auth_and_tenancy.py` enumerates the router and fails the build
    if a route is added without it — the same pattern as the main app's
    route-manifest test, which exists because a route silently dropping
    `requireAuth()` is the easiest security regression to ship.
    """
    token = _bearer_token(request)

    # Built with the anon key + the caller's JWT: reads and writes are scoped
    # by RLS, not by anything this process decides.
    db: Client = create_client(settings.supabase_url, settings.supabase_anon_key)
    db.postgrest.auth(token)

    try:
        auth_response = db.auth.get_user(token)
    except Exception as exc:  # noqa: BLE001 - any failure is an auth failure
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc

    user = getattr(auth_response, "user", None)
    if user is None or not getattr(user, "id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    return Caller(user_id=user.id, db=db)
