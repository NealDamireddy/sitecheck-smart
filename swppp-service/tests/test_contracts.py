"""
Schema, model-pin and API-shape contracts.

Several of these encode bugs the web app already paid for; the comments name
which, so a future reader can tell a deliberate constraint from an arbitrary one.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.schemas import BmpCategory, BMPItemSchema, SWPPPExtractionResponse
from app.services.extraction import _strict_schema
from app.services.vector import chunk_markdown

REPO_ROOT = Path(__file__).resolve().parents[2]


# ── Model pin ───────────────────────────────────────────────────────────────

def test_model_matches_the_web_app_pin():
    """
    AI-03: the same model string lived in six files, one was retired, every AI
    feature 404'd. This service is the seventh copy — it must not drift.
    """
    ts = (REPO_ROOT / "src/lib/ai-model.ts").read_text()
    match = re.search(r"AI_MODEL\s*=\s*'([^']+)'", ts)
    assert match, "could not read AI_MODEL from src/lib/ai-model.ts"

    py = (REPO_ROOT / "swppp-service/app/core/config.py").read_text()
    py_match = re.search(r'anthropic_model:\s*str\s*=\s*"([^"]+)"', py)
    assert py_match, "could not read anthropic_model from config.py"

    assert py_match.group(1) == match.group(1)


def test_retired_model_is_absent():
    """
    Matches quoted literals only. Prose may name a retired model — the comment
    in extraction.py explains why that ID is banned, and a test that cannot
    tell an explanation from a pin would push people to delete the
    explanation.
    """
    retired = ("claude-3-7-sonnet-20250219", "claude-sonnet-4-20250514")
    for path in (REPO_ROOT / "swppp-service/app").rglob("*.py"):
        text = path.read_text()
        for model in retired:
            for quote in ("'", '"'):
                assert f"{quote}{model}" not in text, (
                    f"{path.name} pins the retired model {model}"
                )


def test_no_sampling_parameters():
    """temperature/top_p/top_k are a 400 on every current model."""
    source = (REPO_ROOT / "swppp-service/app/services/extraction.py").read_text()
    for param in ("temperature=", "top_p=", "top_k="):
        assert param not in source, f"{param} is rejected by the API"


# ── BMP category, i.e. DRF-01 ───────────────────────────────────────────────

def test_bmp_category_matches_the_database_check_constraint():
    """
    DRF-01: TypeScript had 11 values, the DB CHECK 6, Zod accepted any string.
    A free-string category here would recreate the drift from a new direction —
    extraction produces "Erosion Control", the INSERT wants 'erosion-control'.
    """
    sql = (REPO_ROOT / "supabase/migrations/001_initial_schema.sql").read_text()
    match = re.search(r"bmp_type TEXT NOT NULL CHECK \(bmp_type IN \(([\s\S]*?)\)\)", sql)
    assert match
    db_values = sorted(re.findall(r"'([a-z-]+)'", match.group(1)))
    assert sorted(c.value for c in BmpCategory) == db_values


def test_every_category_is_writable_to_the_checkpoints_table():
    for category in BmpCategory:
        item = BMPItemSchema(
            bmp_category=category,
            bmp_code="EC-1",
            title="Fiber Rolls",
            inspection_frequency="Weekly",
            maintenance_threshold="Replace when damaged",
        )
        assert item.to_db_bmp_type() == category.value


def test_a_free_string_category_is_rejected():
    with pytest.raises(ValidationError):
        BMPItemSchema(
            bmp_category="Erosion Control",  # the document's wording, not ours
            bmp_code="EC-1",
            title="Fiber Rolls",
            inspection_frequency="Weekly",
            maintenance_threshold="Replace when damaged",
        )


# ── Untrusted model output, i.e. SEC-07 ─────────────────────────────────────

def test_oversized_strings_are_rejected():
    """A SWPPP is customer-supplied and reaches a prompt; an injected
    instruction must not smuggle an unbounded string into Postgres."""
    with pytest.raises(ValidationError):
        BMPItemSchema(
            bmp_category=BmpCategory.EROSION_CONTROL,
            bmp_code="EC-1",
            title="x" * 500,  # cap is 200
            inspection_frequency="Weekly",
            maintenance_threshold="ok",
        )


def test_unknown_fields_are_rejected():
    with pytest.raises(ValidationError):
        SWPPPExtractionResponse(
            risk_level="Level 2", checkpoints=[], injected_field="payload"
        )


def test_locations_default_to_empty_not_invented():
    """AI-01: the extractor must never invent site data. Absent means empty."""
    item = BMPItemSchema(
        bmp_category=BmpCategory.SEDIMENT_CONTROL,
        bmp_code="SE-1",
        title="Silt Fence",
        inspection_frequency="Weekly",
        maintenance_threshold="Repair at 1/3 height",
    )
    assert item.required_locations == []


# ── Strict tool schema ──────────────────────────────────────────────────────

def test_strict_schema_hardens_every_nested_object():
    """
    Anthropic needs additionalProperties:false on *each* object. Pydantic emits
    nested models under $defs; hardening only the top level would silently
    leave the BMP items unconstrained — the part that matters most.
    """
    schema = _strict_schema(SWPPPExtractionResponse)

    def check(node):
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                assert node.get("additionalProperties") is False
                assert "required" in node
            for v in node.values():
                check(v)
        elif isinstance(node, list):
            for i in node:
                check(i)

    check(schema)
    assert schema.get("$defs"), "expected nested $defs to exercise the walk"


# ── Chunking ────────────────────────────────────────────────────────────────

def test_tables_are_not_split_mid_row():
    """A table split across chunks loses its header and retrieves as noise."""
    md = "# BMPs\n\n| Code | Freq |\n|---|---|\n" + "".join(
        f"| EC-{i} | Weekly |\n" for i in range(40)
    )
    for chunk in chunk_markdown(md, max_chars=4_000):
        rows = [l for l in chunk.text.splitlines() if l.strip().startswith("|")]
        if rows:
            assert any("---" in r or "Code" in r for r in rows) or len(rows) > 1


def test_chunk_indices_are_dense_and_ordered():
    chunks = chunk_markdown("# A\n\ntext\n\n# B\n\nmore text")
    assert [c.index for c in chunks] == list(range(len(chunks)))
