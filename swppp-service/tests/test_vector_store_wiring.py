"""
Wiring guards for the vector store.

The bug these exist for: with an in-memory Qdrant, each client instance is a
separate database. The route and the pipeline each did `VectorStore(settings)`
per call, so an upload indexed into one instance and the search queried
another. Nothing errored — search just returned nothing, which reads as "the
document had no relevant sections" rather than "the wiring is broken".
"""

from __future__ import annotations

import inspect
from pathlib import Path

from app.core.config import Settings
from app.services import vector as vector_module
from app.services.vector import get_vector_store

SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _settings(**overrides) -> Settings:
    base = dict(
        supabase_url="https://example.supabase.co",
        supabase_anon_key="anon",
        anthropic_api_key="key",
    )
    return Settings(**{**base, **overrides})


def test_the_store_is_shared_across_calls(settings):
    assert get_vector_store(settings) is get_vector_store(settings)


def test_the_underlying_client_is_shared(settings):
    """The client is the database in memory mode — sharing the wrapper is not
    enough if it rebuilt the client."""
    assert get_vector_store(settings).client is get_vector_store(settings).client


def test_changed_settings_yield_a_new_store():
    a = get_vector_store(_settings(qdrant_collection="one"))
    b = get_vector_store(_settings(qdrant_collection="two"))
    assert a is not b


def test_memory_url_builds_an_embedded_client():
    store = get_vector_store(_settings(qdrant_url=":memory:", qdrant_collection="mem"))
    assert store.client is not None


def test_callers_use_the_singleton_not_the_constructor():
    """
    A future `VectorStore(settings)` in a request path silently reintroduces
    the split-database bug, so this reads the source rather than the behaviour.
    """
    for rel in ("app/api/v1/swppp.py", "app/services/pipeline.py"):
        source = (SERVICE_ROOT / rel).read_text()
        assert "VectorStore(settings)" not in source, (
            f"{rel} constructs a VectorStore directly; use get_vector_store()"
        )
        assert "get_vector_store" in source, f"{rel} does not use get_vector_store"


def test_in_memory_mode_warns():
    """It must be obvious in the logs that the index is not durable."""
    source = inspect.getsource(vector_module._make_client)
    assert "logger.warning" in source
    assert "lost on restart" in source
