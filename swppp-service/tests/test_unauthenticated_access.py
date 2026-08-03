"""
Behavioral proof, not structural: an unauthenticated request must be REFUSED.

test_auth_and_tenancy.py proves the dependency is wired up. This proves the
wiring actually rejects, which is the claim the draft got wrong — it shipped
GET /{site_id}/swppp-search with no auth at all, so anyone could enumerate
site_id and read every tenant's SWPPP text out of Qdrant.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Settings validate at import; supply throwaway values so the app can build.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

from app.main import app  # noqa: E402

client = TestClient(app)

PROJECT = "proj-belonging-to-someone-else"
DATA_ROUTES = [
    ("get", f"/api/v1/projects/{PROJECT}/swppp/search?q=spill+response"),
    ("get", f"/api/v1/projects/{PROJECT}/swppp/doc-123"),
    ("post", f"/api/v1/projects/{PROJECT}/swppp"),
]


@pytest.mark.parametrize("method,path", DATA_ROUTES, ids=lambda v: str(v))
def test_no_token_is_401(method, path):
    response = getattr(client, method)(path)
    assert response.status_code == 401, (
        f"{method.upper()} {path} returned {response.status_code} without a "
        f"token — this endpoint is publicly readable"
    )


@pytest.mark.parametrize("method,path", DATA_ROUTES, ids=lambda v: str(v))
def test_garbage_token_is_401(method, path):
    response = getattr(client, method)(
        path, headers={"Authorization": "Bearer not-a-real-jwt"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize(
    "header",
    ["", "Bearer", "Bearer ", "Basic dXNlcjpwYXNz", "not-a-scheme token"],
    ids=["empty", "scheme-only", "scheme-space", "basic-auth", "bad-scheme"],
)
def test_malformed_authorization_headers_are_401(header):
    response = client.get(
        f"/api/v1/projects/{PROJECT}/swppp/search?q=x",
        headers={"Authorization": header},
    )
    assert response.status_code == 401


def test_health_stays_public_and_leaks_no_configuration():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    # Mirrors the web app's health route: status only, never secrets.
    for key in ("supabase_url", "anthropic_api_key", "qdrant_url", "supabase_anon_key"):
        assert key not in body
    blob = str(body).lower()
    assert "key" not in blob or "api_key" not in blob
