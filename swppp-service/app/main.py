"""SWPPP ingestion service — FastAPI entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.api.v1.swppp import router as swppp_router
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO, format='{"level":"%(levelname)s","msg":"%(message)s"}'
)

app = FastAPI(
    title="SiteCheck SWPPP Service",
    version="0.1.0",
    description=(
        "Layout-aware SWPPP ingestion. Authenticates as the calling user and "
        "relies on Postgres RLS for tenant isolation; holds no service-role key."
    ),
)
app.include_router(swppp_router)


@app.get("/health", tags=["ops"])
async def health() -> dict:
    """Liveness only — no configuration is disclosed (mirrors the web app)."""
    settings = get_settings()
    return {
        "status": "ok",
        "model": settings.anthropic_model,
        "pdf_backend": settings.pdf_backend,
        "embedding_provider": settings.embedding_provider,
    }
