"""
Chunking, embedding and Qdrant storage.

Fixes carried over from the draft:

  * Point IDs are UUID5, derived from (document_id, chunk index). Qdrant only
    accepts an unsigned int or a UUID — the draft's f"{document_id}-{idx}" is
    rejected, so every upsert failed. Deriving rather than randomising also
    makes re-processing a document idempotent instead of duplicating chunks.
  * Embeddings are batched. The draft awaited one HTTP call per chunk; a
    300-page SWPPP is hundreds of sequential round trips.
  * `query_points`, not the deprecated `search`, and typed `Filter` models
    rather than a raw dict.
  * The tenant filter is applied here, but it is NOT the access control — the
    caller must already have passed `Caller.assert_project_access`, which is
    enforced in Postgres under RLS. This filter is defence in depth, not the
    boundary. See app/core/auth.py.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.core.config import Settings

logger = logging.getLogger(__name__)

#: Stable namespace so re-ingesting a document overwrites its own chunks.
_NAMESPACE = uuid.UUID("6f9619ff-8b86-d011-b42d-00c04fc964ff")


@dataclass(frozen=True)
class Chunk:
    text: str
    index: int
    metadata: dict


def chunk_markdown(markdown: str, *, max_chars: int = 4_000) -> list[Chunk]:
    """
    Split on Markdown headings, keeping tables whole.

    A BMP table split across two chunks loses its header row, and half a table
    embedded on its own retrieves as noise — so a section that exceeds
    `max_chars` is split on blank lines between blocks rather than mid-table.
    """
    import re

    sections = re.split(r"\n(?=#{1,6}\s)", markdown)
    chunks: list[Chunk] = []
    heading = ""

    for section in sections:
        section = section.strip()
        if not section:
            continue
        first_line = section.splitlines()[0]
        if first_line.startswith("#"):
            heading = first_line.lstrip("# ").strip()

        if len(section) <= max_chars:
            pieces = [section]
        else:
            pieces, current = [], ""
            for block in section.split("\n\n"):
                if current and len(current) + len(block) + 2 > max_chars:
                    pieces.append(current)
                    current = block
                else:
                    current = f"{current}\n\n{block}" if current else block
            if current:
                pieces.append(current)

        for piece in pieces:
            chunks.append(
                Chunk(
                    text=piece,
                    index=len(chunks),
                    metadata={"heading": heading, "has_table": "|" in piece},
                )
            )

    return chunks


class Embedder:
    """Batched embeddings from whichever provider is configured."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._fastembed = None
        self._openai = None

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self.settings.embedding_provider == "openai":
            return await self._embed_openai(texts)
        return await self._embed_fastembed(texts)

    async def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        from openai import AsyncOpenAI

        if self._openai is None:
            self._openai = AsyncOpenAI(api_key=self.settings.openai_api_key)

        out: list[list[float]] = []
        size = self.settings.embedding_batch_size
        for start in range(0, len(texts), size):
            batch = texts[start : start + size]
            response = await self._openai.embeddings.create(
                input=batch, model=self.settings.openai_embedding_model
            )
            # Order is not guaranteed by position — sort by the returned index.
            out.extend(d.embedding for d in sorted(response.data, key=lambda d: d.index))
        return out

    async def _embed_fastembed(self, texts: list[str]) -> list[list[float]]:
        import asyncio

        from fastembed import TextEmbedding

        if self._fastembed is None:
            self._fastembed = TextEmbedding(model_name=self.settings.fastembed_model)

        def run() -> list[list[float]]:
            return [v.tolist() for v in self._fastembed.embed(texts)]  # type: ignore[union-attr]

        return await asyncio.to_thread(run)


def _make_client(settings: Settings) -> AsyncQdrantClient:
    """
    Build a Qdrant client, embedded or remote.

    `qdrant_url=":memory:"` runs Qdrant inside this process so the upload path
    works with no Docker and no server. Three things it is NOT:

      * durable — the index dies with the process, so a restart leaves
        Postgres holding the BMPs while vector search returns nothing;
      * shared — each uvicorn worker gets its own copy, so with --workers > 1
        a search hits a different index than the upload wrote to;
      * production.

    Point QDRANT_URL at a real instance before this leaves a dev machine. The
    compliance data lives in Postgres either way — Qdrant only ever holds a
    derived copy of the document text, so losing it costs a re-index, never a
    BMP.
    """
    if settings.qdrant_url.strip() == ":memory:":
        logger.warning(
            "Qdrant is running in-memory: the index is per-process and is "
            "lost on restart. Set QDRANT_URL for anything beyond local dev."
        )
        return AsyncQdrantClient(location=":memory:")
    return AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)


class VectorStore:
    def __init__(self, settings: Settings, client: AsyncQdrantClient | None = None):
        self.settings = settings
        self.client = client or _make_client(settings)
        self.embedder = Embedder(settings)

    async def ensure_collection(self) -> None:
        if not await self.client.collection_exists(self.settings.qdrant_collection):
            await self.client.create_collection(
                collection_name=self.settings.qdrant_collection,
                vectors_config=VectorParams(
                    size=self.settings.embedding_dim, distance=Distance.COSINE
                ),
            )
            # Without a payload index the tenant filter degrades to a full scan.
            await self.client.create_payload_index(
                collection_name=self.settings.qdrant_collection,
                field_name="project_id",
                field_schema="keyword",
            )

    async def index_document(
        self, *, project_id: str, document_id: str, chunks: list[Chunk]
    ) -> int:
        if not chunks:
            return 0
        await self.ensure_collection()

        vectors = await self.embedder.embed([c.text for c in chunks])
        if len(vectors) != len(chunks):
            raise RuntimeError(
                f"Embedding count {len(vectors)} != chunk count {len(chunks)}"
            )

        points = [
            PointStruct(
                id=str(uuid.uuid5(_NAMESPACE, f"{document_id}:{chunk.index}")),
                vector=vector,
                payload={
                    "project_id": project_id,
                    "document_id": document_id,
                    "chunk_index": chunk.index,
                    "text": chunk.text,
                    **chunk.metadata,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]

        await self.client.upsert(
            collection_name=self.settings.qdrant_collection, points=points
        )
        return len(points)

    async def search(
        self, *, project_id: str, query: str, limit: int = 5
    ) -> list[dict]:
        """
        Retrieve chunks for one project.

        CALLER CONTRACT: `Caller.assert_project_access(project_id)` must have
        succeeded first. `project_id` must come from that verified path, never
        straight off the URL — see the module docstring.
        """
        vectors = await self.embedder.embed([query])
        if not vectors:
            return []

        response = await self.client.query_points(
            collection_name=self.settings.qdrant_collection,
            query=vectors[0],
            query_filter=Filter(
                must=[
                    FieldCondition(
                        key="project_id", match=MatchValue(value=project_id)
                    )
                ]
            ),
            limit=limit,
            with_payload=True,
        )

        return [
            {
                "text": p.payload.get("text", ""),
                "heading": p.payload.get("heading", ""),
                "document_id": p.payload.get("document_id"),
                "score": p.score,
            }
            for p in response.points
            # Belt and braces: never surface a point whose payload tenant does
            # not match, even if a filter regression let it through.
            if p.payload and p.payload.get("project_id") == project_id
        ]

    async def delete_document(self, *, document_id: str) -> None:
        await self.client.delete(
            collection_name=self.settings.qdrant_collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id", match=MatchValue(value=document_id)
                    )
                ]
            ),
        )


_store: VectorStore | None = None


def get_vector_store(settings: Settings) -> VectorStore:
    """
    The process-wide VectorStore. Always use this, never `VectorStore(...)`.

    With an in-memory Qdrant, every client instance is a SEPARATE database.
    Constructing a VectorStore per request — which is what the route and the
    pipeline did — meant the upload indexed into one instance and the search
    queried another, so search returned nothing while looking perfectly
    healthy. Sharing one instance is also correct for a remote Qdrant, where
    it reuses the connection pool instead of opening a client per request.

    Keyed on the identity of `settings` rather than its value: Settings is not
    hashable, and `get_settings()` is itself cached, so in normal operation
    this is a true singleton while a test passing its own Settings still gets
    a fresh store.
    """
    global _store
    if _store is None or _store.settings is not settings:
        _store = VectorStore(settings)
    return _store
