#!/usr/bin/env python
"""
Run the real pipeline against a real PDF, with no infrastructure.

    .venv/bin/python scripts/try_extract.py path/to/swppp.pdf

No Postgres, no Qdrant, no auth, no server. It calls the same
`pdf_to_markdown()` and `extract_swppp()` the service uses, so a green run here
means conversion and extraction genuinely work on your document — the two
things worth confirming before spending time on infrastructure.

Only ANTHROPIC_API_KEY is required (read from ../.env.local if present).

Flags:
    --markdown       print the converted Markdown and stop (no API call, free)
    --save-md FILE   write the Markdown out to inspect the table fidelity
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))


def _load_env() -> None:
    """Reuse the web app's key so there is nothing new to configure."""
    for candidate in (SERVICE_ROOT / ".env", SERVICE_ROOT.parent / ".env.local"):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env()
# Settings validate at import; the pipeline below touches neither.
os.environ.setdefault("SUPABASE_URL", "https://placeholder.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "placeholder-anon-key")

from app.core.config import get_settings  # noqa: E402
from app.services.extraction import ExtractionError, extract_swppp  # noqa: E402
from app.services.pdf import PdfConversionError, pdf_to_markdown  # noqa: E402

BOLD, DIM, GREEN, RED, YELLOW, RESET = (
    "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m",
)


def _table_preview(markdown: str, limit: int = 3) -> list[str]:
    """Pull out Markdown tables — the thing pdf-parse destroys."""
    tables, current = [], []
    for line in markdown.splitlines():
        if line.strip().startswith("|"):
            current.append(line.rstrip())
        elif current:
            if len(current) >= 3:
                tables.append("\n".join(current[:6]))
            current = []
    if len(current) >= 3:
        tables.append("\n".join(current[:6]))
    return tables[:limit]


async def main() -> int:
    parser = argparse.ArgumentParser(description="Try the SWPPP pipeline on a PDF.")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--markdown", action="store_true", help="convert only, no API call")
    parser.add_argument("--save-md", type=Path, default=None)
    args = parser.parse_args()

    if not args.pdf.exists():
        print(f"{RED}No such file: {args.pdf}{RESET}")
        return 1

    settings = get_settings()
    data = args.pdf.read_bytes()
    print(f"\n{BOLD}{args.pdf.name}{RESET}  {len(data)/1024:.0f} KB")

    # ── 1. Convert ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}1. PDF → Markdown{RESET} {DIM}(backend: {settings.pdf_backend}){RESET}")
    try:
        conversion = await pdf_to_markdown(data, settings=settings)
    except PdfConversionError as exc:
        print(f"   {RED}FAILED{RESET} {exc}")
        return 1
    except ImportError as exc:
        print(f"   {RED}Backend not installed{RESET} — {exc}")
        print(f"   {DIM}.venv/bin/pip install pymupdf4llm{RESET}")
        return 1

    print(
        f"   {GREEN}ok{RESET}  {conversion.page_count} pages, "
        f"{len(conversion.markdown):,} chars, via {conversion.backend}"
    )

    tables = _table_preview(conversion.markdown)
    if tables:
        print(f"   {GREEN}{len(tables)}+ table(s) preserved as Markdown{RESET} "
              f"{DIM}(pdf-parse would have flattened these){RESET}")
        print(f"\n{DIM}" + "\n".join(tables[0].splitlines()[:4]) + f"{RESET}")
    else:
        print(f"   {YELLOW}No Markdown tables detected.{RESET} If this SWPPP has BMP")
        print(f"   {DIM}schedules as tables, try PDF_BACKEND=marker for better fidelity.{RESET}")

    if args.save_md:
        args.save_md.write_text(conversion.markdown)
        print(f"   {DIM}markdown → {args.save_md}{RESET}")

    if args.markdown:
        print(f"\n{DIM}--markdown given; stopping before the API call.{RESET}\n")
        return 0

    # ── 2. Extract ──────────────────────────────────────────────────────────
    print(f"\n{BOLD}2. Claude extraction{RESET} {DIM}({settings.anthropic_model}){RESET}")
    if not settings.anthropic_api_key:
        print(f"   {RED}ANTHROPIC_API_KEY not set{RESET}")
        return 1

    try:
        result = await extract_swppp(conversion.markdown, settings=settings)
    except ExtractionError as exc:
        print(f"   {RED}FAILED{RESET} {exc}")
        return 1

    print(f"   {GREEN}ok{RESET}  {len(result.checkpoints)} BMPs extracted")
    print(f"\n{BOLD}Document{RESET}")
    print(f"   WDID       {result.site_wdid or DIM + 'not stated' + RESET}")
    print(f"   Risk level {result.risk_level.value if result.risk_level else DIM + 'not stated' + RESET}")
    print(f"   QSP        {result.qsp_name or DIM + 'not stated' + RESET}")

    if result.checkpoints:
        print(f"\n{BOLD}BMPs{RESET}")
        for bmp in result.checkpoints[:15]:
            print(f"\n   {BOLD}{bmp.bmp_code}{RESET}  {bmp.title}")
            print(f"      category   {bmp.bmp_category.value}")
            freqs = ", ".join(f.value for f in bmp.inspection_frequency)
            print(f"      frequency  {freqs or DIM + 'none stated' + RESET}")
            print(f"      threshold  {bmp.maintenance_threshold[:90]}")
            locations = ", ".join(bmp.required_locations[:3]) or DIM + "none stated" + RESET
            print(f"      locations  {locations}")
        if len(result.checkpoints) > 15:
            print(f"\n   {DIM}… and {len(result.checkpoints) - 15} more{RESET}")

    # Extracting zero BMPs from a SWPPP is a failure, not a success. The
    # earlier version printed "Pipeline works" over a 0-BMP result.
    if not result.checkpoints:
        print(f"\n{RED}{BOLD}No BMPs extracted.{RESET} Conversion worked, so this is")
        print(f"{DIM}an extraction problem, not a PDF problem. Re-run to check whether")
        print(f"it is intermittent, and inspect the Markdown with --save-md.{RESET}\n")
        return 1

    print(f"\n{GREEN}{BOLD}Pipeline works on this document.{RESET}")
    print(f"{DIM}Conversion and extraction are the parts worth confirming; the rest")
    print(f"is storage plumbing.{RESET}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
