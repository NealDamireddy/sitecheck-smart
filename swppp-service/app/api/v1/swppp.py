"""
SWPPP ingestion and retrieval routes.

Every route depends on `require_caller`. The tenant is taken from the verified
JWT and proven against Postgres under RLS — never trusted from the path. The
route path still carries `project_id` because it is a useful resource
identifier, but `assert_project_access` is what decides whether the caller may
touch it, and that decision is made by Postgres, not by this process.

`tests/test_auth_and_tenancy.py` walks this router and fails the build if a
route is added without the dependency.
"""

from __future__ import annotations

import uuid

from anthropic import AsyncAnthropic
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.auth import Caller, require_caller
from app.core.config import Settings, get_settings
from app.services.pipeline import process_swppp_document
from app.services.vector import VectorStore

router = APIRouter(prefix="/api/v1/projects", tags=["SWPPP"])


class UploadAccepted(BaseModel):
    status: str
    document_id: str
    message: str


class SearchHit(BaseModel):
    text: str
    heading: str
    document_id: str | None
    score: float


class SearchResponse(BaseModel):
    query: str
    answer: str
    sources: list[SearchHit]


@router.post(
    "/{project_id}/swppp",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=UploadAccepted,
)
async def upload_swppp(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    caller: Caller = Depends(require_caller),
    settings: Settings = Depends(get_settings),
) -> UploadAccepted:
    await caller.assert_project_access(project_id)

    if (file.content_type or "").lower() not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be a PDF")

    # Read here, not in the background task: FastAPI closes the spooled temp
    # file once this response returns.
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(data) > settings.max_pdf_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File too large (max {settings.max_pdf_bytes // 1024 // 1024}MB)",
        )

    document_id = str(uuid.uuid4())

    # Insert the row before queueing so a crash between here and the worker
    # leaves a visible "processing" record rather than a silently lost upload.
    caller.db.table("swppp_documents").insert(
        {
            "id": document_id,
            "project_id": project_id,
            "filename": file.filename or "swppp.pdf",
            "status": "processing",
            "uploaded_by": caller.user_id,
        }
    ).execute()

    background_tasks.add_task(
        process_swppp_document,
        data=data,
        filename=file.filename or "swppp.pdf",
        project_id=project_id,
        document_id=document_id,
        db=caller.db,
        settings=settings,
    )

    return UploadAccepted(
        status="processing",
        document_id=document_id,
        message="Queued for layout-aware extraction. Poll the document for status.",
    )


@router.get("/{project_id}/swppp/search", response_model=SearchResponse)
async def search_swppp(
    project_id: str,
    q: str,
    caller: Caller = Depends(require_caller),
    settings: Settings = Depends(get_settings),
) -> SearchResponse:
    # The gate. Without this the filter below is caller-controlled and the
    # endpoint reads every tenant's documents — the defect this service was
    # rewritten to close.
    await caller.assert_project_access(project_id)

    if not q.strip():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Query must not be empty")

    hits = await VectorStore(settings).search(project_id=project_id, query=q, limit=5)
    if not hits:
        return SearchResponse(
            query=q,
            answer="No relevant sections found in this project's SWPPP.",
            sources=[],
        )

    context = "\n\n---\n\n".join(
        f"[{h['heading'] or 'section'}]\n{h['text']}" for h in hits
    )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=2_048,
        system=(
            "Answer questions about a SWPPP using only the provided excerpts. "
            "Quote the document where possible. If the excerpts do not contain "
            "the answer, say so — never fill the gap from general knowledge, "
            "because this informs a regulatory compliance decision."
        ),
        messages=[
            {
                "role": "user",
                "content": f"SWPPP excerpts:\n{context}\n\nQuestion: {q}",
            }
        ],
    )

    # content[0] is a thinking block on current models — find the text block.
    text_block = next((b for b in message.content if b.type == "text"), None)
    if text_block is None:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, "No answer returned — try again."
        )

    return SearchResponse(
        query=q,
        answer=text_block.text,
        sources=[SearchHit(**h) for h in hits],
    )


@router.get("/{project_id}/swppp/{document_id}")
async def get_document_status(
    project_id: str,
    document_id: str,
    caller: Caller = Depends(require_caller),
) -> dict:
    await caller.assert_project_access(project_id)

    result = (
        caller.db.table("swppp_documents")
        .select("id,filename,status,error_message,bmp_count,page_count,uploaded_at")
        .eq("id", document_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return result.data[0]
