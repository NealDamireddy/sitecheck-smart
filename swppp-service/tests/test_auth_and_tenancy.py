"""
The properties that must not regress.

These are structural tests: they read the router and the source, so they fail
on a *new* route that forgets the dependency, not merely on the routes that
exist today. Same reasoning as the web app's route-manifest test — a route
silently dropping its auth guard is the easiest security regression to ship.
"""

from __future__ import annotations

import inspect
import re
from pathlib import Path

import pytest

from app.api.v1 import swppp as swppp_module
from app.core import auth as auth_module
from app.core.auth import require_caller

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _data_routes():
    """Every route except /health."""
    return [
        r
        for r in swppp_module.router.routes
        if getattr(r, "path", "").startswith("/api/v1/")
    ]


def test_router_has_routes():
    assert _data_routes(), "no routes found — the test would pass vacuously"


@pytest.mark.parametrize("route", _data_routes(), ids=lambda r: r.path)
def test_every_route_requires_authentication(route):
    """
    The original draft shipped an unauthenticated search endpoint that took the
    tenant from the URL. This fails the build if that ever comes back.
    """
    params = inspect.signature(route.endpoint).parameters
    depends = [
        p.default.dependency
        for p in params.values()
        if hasattr(p.default, "dependency")
    ]
    assert require_caller in depends, (
        f"{route.path} has no require_caller dependency — it is reachable "
        f"unauthenticated"
    )


@pytest.mark.parametrize("route", _data_routes(), ids=lambda r: r.path)
def test_every_project_route_proves_access(route):
    """
    Taking project_id from the path is fine; trusting it is not. Any route
    carrying {project_id} must call assert_project_access, which resolves the
    question in Postgres under RLS.
    """
    if "{project_id}" not in route.path:
        return
    source = inspect.getsource(route.endpoint)
    assert "assert_project_access" in source, (
        f"{route.path} uses project_id without proving access to it"
    )


def test_service_never_holds_the_service_role_key():
    """
    The whole security model rests on this: the service authenticates as the
    caller, so RLS applies. A service-role key would silently make every RLS
    policy irrelevant for anything this process does.
    """
    offenders = []
    for path in SERVICE_ROOT.rglob("app/**/*.py"):
        text = path.read_text()
        if re.search(r"service_role|SERVICE_ROLE", text) and "must never" not in text:
            offenders.append(str(path.relative_to(SERVICE_ROOT)))
    assert not offenders, f"service-role key referenced in: {offenders}"


def test_access_check_is_a_404_not_a_403():
    """A 403 confirms the project exists, which is itself a cross-tenant leak."""
    source = inspect.getsource(auth_module.Caller.assert_project_access)
    assert "HTTP_404_NOT_FOUND" in source
    assert "HTTP_403" not in source


def test_vector_search_documents_its_caller_contract():
    """
    The Qdrant filter is defence in depth, not the boundary. If someone later
    reads vector.py in isolation they must not conclude otherwise.
    """
    from app.services import vector

    doc = inspect.getdoc(vector.VectorStore.search) or ""
    assert "assert_project_access" in doc


def test_search_results_are_re_checked_against_the_tenant():
    source = inspect.getsource(
        __import__("app.services.vector", fromlist=["x"]).VectorStore.search
    )
    assert 'p.payload.get("project_id") == project_id' in source
