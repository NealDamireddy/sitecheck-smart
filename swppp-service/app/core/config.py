"""
Service configuration.

Fail-fast: every required setting is validated at import time, so a missing
secret is a startup crash with a named field rather than a 500 on the first
customer upload. (CLD-04 in the main app's FOLLOW_UP is the same gap, still
open there — this service does not repeat it.)
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # ── Supabase ────────────────────────────────────────────────────────────
    # NOTE: the anon key only. This service must NEVER hold the service-role
    # key: it authenticates as the calling user and relies on Postgres RLS for
    # every tenant boundary. Holding the service-role key here would silently
    # convert a bug in this service into a cross-tenant data breach.
    supabase_url: str = Field(..., description="https://<ref>.supabase.co")
    supabase_anon_key: str = Field(..., description="anon/publishable key ONLY")

    # ── Anthropic ───────────────────────────────────────────────────────────
    anthropic_api_key: str
    # Must match AI_MODEL in ../../src/lib/ai-model.ts.
    # tests/test_model_pin.py fails if the two drift.
    anthropic_model: str = "claude-opus-5"
    # Thinking is on by default from Opus 5 and max_tokens caps thinking PLUS
    # response text. A real SWPPP yields dozens of BMPs; 4000 truncates.
    extraction_max_tokens: int = 16_384

    # ── Qdrant ──────────────────────────────────────────────────────────────
    #: ":memory:" runs Qdrant embedded in this process — no Docker, no server.
    #: Fine for local development and tests; see VectorStore for the caveats
    #: (per-process, lost on restart, single worker only).
    qdrant_url: str = ":memory:"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "swppp_chunks"

    # ── Embeddings ──────────────────────────────────────────────────────────
    # "fastembed" keeps customer SWPPP text on our own infrastructure.
    # "openai" is higher quality but sends legal-record documents to a second
    # vendor — a deliberate choice, not a default.
    embedding_provider: Literal["fastembed", "openai"] = "fastembed"
    openai_api_key: str | None = None
    openai_embedding_model: str = "text-embedding-3-small"
    fastembed_model: str = "BAAI/bge-small-en-v1.5"
    embedding_batch_size: int = 128

    # ── PDF conversion ──────────────────────────────────────────────────────
    # All three are layout-aware and emit Markdown tables — the point of this
    # service. They trade install weight against table fidelity:
    #
    #   pymupdf  ~50 MB, installs in seconds, no ML deps. Good tables.
    #            Start here: it makes the pipeline testable immediately.
    #   marker   multi-GB (pulls torch), slow first run. Best fidelity on
    #            messy scans and merged cells. Worth it once you have a real
    #            SWPPP that pymupdf gets wrong.
    #   unstructured  middle ground; hi_res needs poppler + tesseract.
    pdf_backend: Literal["pymupdf", "marker", "unstructured"] = "pymupdf"
    max_pdf_bytes: int = 50 * 1024 * 1024

    @property
    def embedding_dim(self) -> int:
        """Vector width. Wrong value here => Qdrant rejects every upsert."""
        return 1536 if self.embedding_provider == "openai" else 384

    @model_validator(mode="after")
    def _check_provider_keys(self) -> "Settings":
        if self.embedding_provider == "openai" and not self.openai_api_key:
            raise ValueError(
                "embedding_provider='openai' requires OPENAI_API_KEY. "
                "Use embedding_provider='fastembed' to keep customer "
                "documents on our own infrastructure."
            )
        if "service_role" in self.supabase_anon_key:
            raise ValueError(
                "SUPABASE_ANON_KEY looks like a service-role key. This "
                "service authenticates as the calling user and must never "
                "hold a key that bypasses RLS."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
