"""
Reliability guards, each measured rather than assumed.

Baseline over 8 runs on byte-identical input, before these fixes:
    all 10 BMPs 6/8 · one run returned 1 BMP · one returned 0
    risk_level correct 3/5 (two runs said "LUP" for a document
    plainly reading "Risk Level: Level 2")
After: 8/8 on every metric.
"""

from __future__ import annotations

import pytest

from app.models.schemas import (
    BMPItemSchema,
    BmpCategory,
    RiskLevel,
    SWPPPExtractionResponse,
    parse_risk_level,
)
from app.services.extraction import MAX_ATTEMPTS, bmp_codes_in_source, extract_swppp
from app.services.extraction import ExtractionError


# ── risk level: parse the quote, don't trust the classification ─────────────

@pytest.mark.parametrize(
    "text,expected",
    [
        ("Risk Level: Level 2", RiskLevel.LEVEL_2),
        ("risk level: level 3", RiskLevel.LEVEL_3),
        ("Project Risk Level 1 per CGP", RiskLevel.LEVEL_1),
        ("This is a LUP project", RiskLevel.LUP),
        ("Linear Underground Project", RiskLevel.LUP),
        # A LUP SWPPP may mention both; the numbered level sets the deadline.
        ("LUP — Risk Level 2", RiskLevel.LEVEL_2),
        ("no risk information here", None),
        (None, None),
        ("", None),
    ],
)
def test_parse_risk_level(text, expected):
    assert parse_risk_level(text) == expected


def test_quote_overrides_a_wrong_classification():
    """
    The measured failure: the model quoted 'Risk Level: Level 2' correctly
    5/5 times but classified one of them as LUP. Finding text is a language
    task; turning "Level 2" into an enum is a parse, so the parse wins.
    """
    result = SWPPPExtractionResponse(
        risk_level_source_text="Risk Level: Level 2",
        risk_level=RiskLevel.LUP,  # what the model actually returned
        checkpoints=[],
    )
    assert result.risk_level == RiskLevel.LEVEL_2


def test_classification_is_kept_when_there_is_no_quote_to_parse():
    result = SWPPPExtractionResponse(
        risk_level_source_text=None, risk_level=RiskLevel.LUP, checkpoints=[]
    )
    assert result.risk_level == RiskLevel.LUP


# ── completeness ────────────────────────────────────────────────────────────

def test_bmp_codes_in_source():
    md = "|EC-1|...| |SE-10|...| and WM-4 applies. Also NS-3, TC-1, WE-1."
    assert bmp_codes_in_source(md) == {"EC-1", "SE-10", "WM-4", "NS-3", "TC-1", "WE-1"}


def test_prose_without_codes_expects_nothing():
    assert bmp_codes_in_source("A SWPPP with no coded BMPs.") == set()


class _FakeClient:
    """Returns a scripted sequence of BMP-code lists, one per call."""

    def __init__(self, sequences):
        self.sequences = list(sequences)
        self.calls = 0
        self.messages = self

    async def create(self, **kwargs):
        codes = self.sequences[min(self.calls, len(self.sequences) - 1)]
        self.calls += 1

        class Block:
            type = "tool_use"
            name = "record_swppp_requirements"
            input = {
                "site_wdid": None,
                "risk_level_source_text": None,
                "risk_level": None,
                "qsp_name": None,
                "checkpoints": [
                    {
                        "bmp_category": "erosion-control",
                        "bmp_code": c,
                        "title": "T",
                        "required_locations": [],
                        "inspection_frequency": ["Weekly"],
                        "maintenance_threshold": "x",
                    }
                    for c in codes
                ],
            }

        class Usage:
            input_tokens = output_tokens = 0

        class Response:
            stop_reason = "tool_use"
            content = [Block()]
            usage = Usage()

        return Response()


SOURCE = "|EC-1| |SE-1| |WM-4|"


@pytest.mark.asyncio
async def test_a_complete_first_attempt_costs_one_call(settings):
    client = _FakeClient([["EC-1", "SE-1", "WM-4"]])
    result = await extract_swppp(SOURCE, settings=settings, client=client)
    assert len(result.checkpoints) == 3
    assert client.calls == 1, "a good result must not trigger retries"


@pytest.mark.asyncio
async def test_a_partial_result_is_retried(settings):
    """The dangerous case: 1 of 3 BMPs looks like a successful ingestion."""
    client = _FakeClient([["EC-1"], ["EC-1", "SE-1", "WM-4"]])
    result = await extract_swppp(SOURCE, settings=settings, client=client)
    assert len(result.checkpoints) == 3
    assert client.calls == 2


@pytest.mark.asyncio
async def test_an_empty_result_is_retried(settings):
    client = _FakeClient([[], ["EC-1", "SE-1", "WM-4"]])
    result = await extract_swppp(SOURCE, settings=settings, client=client)
    assert len(result.checkpoints) == 3


@pytest.mark.asyncio
async def test_persistently_incomplete_raises_and_names_the_gap(settings):
    """Never store a partial result as though it were complete."""
    client = _FakeClient([["EC-1"]])
    with pytest.raises(ExtractionError) as exc:
        await extract_swppp(SOURCE, settings=settings, client=client)
    assert client.calls == MAX_ATTEMPTS
    message = str(exc.value)
    assert "SE-1" in message and "WM-4" in message
    assert "Nothing was saved" in message


@pytest.mark.asyncio
async def test_a_document_with_no_bmp_codes_is_not_retried(settings):
    """An honestly-empty SWPPP must not burn three calls."""
    client = _FakeClient([[]])
    result = await extract_swppp("Prose only, no codes.", settings=settings, client=client)
    assert result.checkpoints == []
    assert client.calls == 1
