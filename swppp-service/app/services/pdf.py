"""
Layout-aware PDF → Markdown.

This is the whole reason the service is in Python. The web app uses
`pdf-parse`, which returns a flat character stream: a BMP schedule table comes
out as run-together words with the row/column relationship destroyed, so the
model has to guess which frequency belongs to which BMP. `marker` reconstructs
tables as Markdown tables, which is exactly the structure the extraction prompt
then reads row-by-row.

Both backends are heavy imports (marker pulls in torch), so they are imported
lazily inside the call — a unit test that never converts a PDF must not pay a
multi-second import, and `pytest` must run on a machine with neither installed.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.core.config import Settings

logger = logging.getLogger(__name__)


class PdfConversionError(RuntimeError):
    """Conversion failed or produced nothing usable."""


@dataclass(frozen=True)
class ConversionResult:
    markdown: str
    page_count: int
    backend: str


def _convert_with_pymupdf(data: bytes) -> ConversionResult:
    """
    PyMuPDF4LLM. Installs in seconds with no ML dependencies and still emits
    real Markdown tables, which is the property that matters here — it is
    `pdf-parse`'s flat text stream that this service exists to replace, and
    pymupdf already clears that bar. Reach for marker when a specific document
    defeats it.
    """
    import fitz  # PyMuPDF
    import pymupdf4llm

    doc = fitz.open(stream=data, filetype="pdf")
    try:
        page_count = doc.page_count
    finally:
        doc.close()

    markdown = pymupdf4llm.to_markdown(
        fitz.open(stream=data, filetype="pdf"), show_progress=False
    )
    return ConversionResult(markdown=markdown, page_count=page_count, backend="pymupdf")


def _convert_with_marker(data: bytes) -> ConversionResult:
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict
    from marker.output import text_from_rendered

    converter = PdfConverter(artifact_dict=create_model_dict())
    rendered = converter(data)
    markdown, _, _ = text_from_rendered(rendered)
    pages = getattr(rendered, "page_count", 0) or markdown.count("\n---\n") + 1
    return ConversionResult(markdown=markdown, page_count=pages, backend="marker")


def _convert_with_unstructured(data: bytes) -> ConversionResult:
    import io

    from unstructured.partition.pdf import partition_pdf

    elements = partition_pdf(
        file=io.BytesIO(data),
        strategy="hi_res",           # required for table structure
        infer_table_structure=True,  # without this, tables flatten -> pdf-parse again
    )

    parts: list[str] = []
    pages: set[int] = set()
    for el in elements:
        page = getattr(el.metadata, "page_number", None)
        if page:
            pages.add(page)
        # Prefer the HTML rendering of a table: it preserves the grid.
        html = getattr(el.metadata, "text_as_html", None)
        parts.append(html if html else str(el))

    return ConversionResult(
        markdown="\n\n".join(p for p in parts if p.strip()),
        page_count=len(pages),
        backend="unstructured",
    )


async def pdf_to_markdown(data: bytes, *, settings: Settings) -> ConversionResult:
    """
    Convert PDF bytes to Markdown, preserving tables.

    Runs in a worker thread: both backends are synchronous and CPU-bound, and
    calling them directly on the event loop would block every other request in
    the process for the duration of a multi-minute conversion.
    """
    if not data:
        raise PdfConversionError("Empty file")
    if len(data) > settings.max_pdf_bytes:
        raise PdfConversionError(
            f"File is {len(data)} bytes, over the {settings.max_pdf_bytes} limit"
        )
    if not data.startswith(b"%PDF-"):
        raise PdfConversionError("Not a PDF (missing %PDF- header)")

    backends = {
        "pymupdf": _convert_with_pymupdf,
        "marker": _convert_with_marker,
        "unstructured": _convert_with_unstructured,
    }
    primary = backends[settings.pdf_backend]
    # Fall back to whichever of the others is installed. A missing optional
    # dependency should degrade the conversion, not fail the upload.
    fallback_order = [b for name, b in backends.items() if name != settings.pdf_backend]
    fallback = fallback_order[0] if fallback_order else None

    try:
        result = await asyncio.to_thread(primary, data)
    except Exception as exc:  # noqa: BLE001
        if fallback is None:
            raise PdfConversionError(f"PDF conversion failed: {exc}") from exc
        logger.warning("marker failed, falling back to unstructured: %s", exc)
        try:
            result = await asyncio.to_thread(fallback, data)
        except Exception as exc2:  # noqa: BLE001
            raise PdfConversionError(f"PDF conversion failed: {exc2}") from exc2

    # A scanned, image-only SWPPP yields near-empty text. Say so plainly rather
    # than sending whitespace to Claude and getting a confident empty result.
    if len(result.markdown.strip()) < 50:
        raise PdfConversionError(
            "Extracted almost no text — this looks like a scanned/image-only "
            "PDF that needs OCR before it can be processed."
        )

    logger.info(
        "pdf converted",
        extra={
            "backend": result.backend,
            "pages": result.page_count,
            "chars": len(result.markdown),
        },
    )
    return result
