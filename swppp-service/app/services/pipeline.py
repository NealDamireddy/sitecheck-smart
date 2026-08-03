"""
Orchestration: bytes → Markdown → extract → persist → index.

The draft queued `process_swppp_document(file, ...)` as a BackgroundTask and
read the `UploadFile` inside it. FastAPI closes the underlying spooled temp
file when the response is returned, so the task received a closed handle — the
pipeline could never have run. Bytes are therefore read in the request handler
and only `bytes` cross the boundary (see api/v1/swppp.py).

Every exit path writes a terminal status. A document that stops at
"processing" with no error recorded is indistinguishable from one still
running, and for a legal-record system that silence is the failure mode that
matters: the QSP believes their SWPPP was ingested when nothing was stored.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from supabase import Client

from app.core.config import Settings
from app.services.extraction import ExtractionError, extract_swppp
from app.services.pdf import PdfConversionError, pdf_to_markdown
from app.services.vector import VectorStore, chunk_markdown

logger = logging.getLogger(__name__)


def _set_status(
    db: Client, document_id: str, status: str, **fields
) -> None:
    """Write a terminal state. Never raises — a logging failure must not mask
    the original error that brought us here."""
    try:
        db.table("swppp_documents").update(
            {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), **fields}
        ).eq("id", document_id).execute()
    except Exception:  # noqa: BLE001
        logger.exception("could not record status=%s for %s", status, document_id)


async def process_swppp_document(
    *,
    data: bytes,
    filename: str,
    project_id: str,
    document_id: str,
    db: Client,
    settings: Settings,
    vector_store: VectorStore | None = None,
) -> None:
    """
    Run the pipeline for one document.

    `db` is the caller's RLS-scoped client, so every write here is still
    subject to the same policies as the web app: this cannot write a row into
    another tenant's project even if `project_id` were wrong.
    """
    store = vector_store or VectorStore(settings)

    try:
        conversion = await pdf_to_markdown(data, settings=settings)
    except PdfConversionError as exc:
        logger.warning("pdf conversion failed for %s: %s", document_id, exc)
        _set_status(db, document_id, "failed", error_message=str(exc))
        return

    _set_status(
        db,
        document_id,
        "processing",
        raw_markdown=conversion.markdown,
        page_count=conversion.page_count,
        pdf_backend=conversion.backend,
    )

    try:
        extracted = await extract_swppp(conversion.markdown, settings=settings)
    except ExtractionError as exc:
        logger.warning("extraction failed for %s: %s", document_id, exc)
        _set_status(db, document_id, "failed", error_message=str(exc))
        return
    except Exception as exc:  # noqa: BLE001
        logger.exception("unexpected extraction error for %s", document_id)
        _set_status(db, document_id, "failed", error_message=f"Extraction error: {exc}")
        return

    # Persist the structured result. Written as a draft for QSP review — the
    # product invariant is that AI output is never authority, so nothing here
    # sets a compliance status.
    rows = [
        {
            "document_id": document_id,
            "project_id": project_id,
            "bmp_category": item.to_db_bmp_type(),
            "bmp_code": item.bmp_code,
            "title": item.title,
            "required_locations": item.required_locations,
            "inspection_frequency": [f.value for f in item.inspection_frequency],
            "maintenance_threshold": item.maintenance_threshold,
            "is_active": True,
        }
        for item in extracted.checkpoints
    ]

    try:
        if rows:
            db.table("bmp_checkpoint_drafts").insert(rows).execute()
    except Exception as exc:  # noqa: BLE001
        logger.exception("persisting checkpoints failed for %s", document_id)
        _set_status(db, document_id, "failed", error_message=f"Database error: {exc}")
        return

    # Indexing is best-effort: the compliance data is already safely stored,
    # and a Qdrant outage must not mark an otherwise-good ingestion as failed.
    indexed = 0
    try:
        indexed = await store.index_document(
            project_id=project_id,
            document_id=document_id,
            chunks=chunk_markdown(conversion.markdown),
        )
    except Exception:  # noqa: BLE001
        logger.exception("vector indexing failed for %s (data is stored)", document_id)

    _set_status(
        db,
        document_id,
        "completed",
        extracted_wdid=extracted.site_wdid,
        extracted_risk_level=extracted.risk_level.value if extracted.risk_level else None,
        extracted_qsp_name=extracted.qsp_name,
        bmp_count=len(rows),
        indexed_chunks=indexed,
    )
    logger.info(
        "swppp ingested",
        extra={"document_id": document_id, "bmps": len(rows), "chunks": indexed},
    )
