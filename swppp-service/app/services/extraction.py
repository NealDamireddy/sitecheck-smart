"""
Claude extraction.

Differences from the draft, all of them load-bearing:

  * Model comes from settings (`claude-opus-5`). The draft's
    `claude-3-7-sonnet-20250219` was retired on 2026-02-19 and returns 404 —
    the exact outage the web app hit (AI-03) and the reason this is a config
    value with a drift test rather than a literal in three files.
  * No `temperature`. Rejected with a 400 on every current model. Determinism
    comes from `strict: true`, which is stronger anyway.
  * `strict=True` + `additionalProperties: false`, so `tool_use.input`
    validates against the schema before it reaches us. This is what makes the
    whole markdown-fence class of bug (AI-05) structurally impossible: there
    is no prose to parse, so there is nothing to unwrap or mis-parse.
  * `stop_reason` is checked before reading content. A refusal or a
    `max_tokens` truncation returns no tool_use block, and the draft's
    `next(...)` raised a bare StopIteration into a background task — a
    document stuck "processing" forever with no error recorded.
"""

from __future__ import annotations

import logging
from typing import Any

from anthropic import AsyncAnthropic

from app.core.config import Settings
from app.models.schemas import SWPPPExtractionResponse

logger = logging.getLogger(__name__)

TOOL_NAME = "record_swppp_requirements"

SYSTEM_PROMPT = """You are a California CGP 2022 (Construction General Permit) \
compliance analyst. You read SWPPP documents and record every BMP requirement \
they contain.

The text you receive is Markdown converted from a PDF, so BMP schedules appear \
as Markdown tables. Read the tables carefully — a single table row is usually \
one BMP with its code, locations, frequency and maintenance trigger.

Rules that matter more than completeness:
- Record only what the document states. If a field is not stated, use null or \
an empty list. Never infer a location, a frequency, or a threshold.
- This output becomes a legal compliance record. An invented requirement is \
worse than a missing one.
- Quote maintenance thresholds in the document's own terms.
- Call the tool exactly once, with every BMP you found."""


def _strict_schema(model: type) -> dict[str, Any]:
    """
    Pydantic JSON Schema, hardened for strict tool use.

    Anthropic requires `additionalProperties: false` on every object and an
    explicit `required` list. Pydantic emits neither for nested `$defs`, so we
    walk the whole tree rather than only the top level — missing a nested
    object silently drops strictness for exactly the part we care about most
    (the BMP items).
    """
    schema = model.model_json_schema()

    def harden(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node.setdefault("required", sorted(node["properties"].keys()))
            for value in node.values():
                harden(value)
        elif isinstance(node, list):
            for item in node:
                harden(item)

    harden(schema)
    return schema


class ExtractionError(RuntimeError):
    """Extraction did not produce a usable result. Never silently swallowed."""


async def extract_swppp(
    markdown: str, *, settings: Settings, client: AsyncAnthropic | None = None
) -> SWPPPExtractionResponse:
    client = client or AsyncAnthropic(api_key=settings.anthropic_api_key)

    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=settings.extraction_max_tokens,
        system=SYSTEM_PROMPT,
        tools=[
            {
                "name": TOOL_NAME,
                "description": "Record the BMP requirements found in this SWPPP.",
                "input_schema": _strict_schema(SWPPPExtractionResponse),
                "strict": True,
            }
        ],
        tool_choice={"type": "tool", "name": TOOL_NAME},
        messages=[
            {
                "role": "user",
                "content": (
                    "Record every BMP requirement in this SWPPP.\n\n"
                    "--- SWPPP DOCUMENT (Markdown) ---\n"
                    f"{markdown}\n"
                    "--- END ---"
                ),
            }
        ],
    )

    # Check why generation stopped BEFORE reading content. `refusal` and
    # `max_tokens` both yield no tool_use block.
    if response.stop_reason == "refusal":
        raise ExtractionError(
            "Model declined to process this document (safety classifier)."
        )
    if response.stop_reason == "max_tokens":
        raise ExtractionError(
            f"Extraction truncated at {settings.extraction_max_tokens} tokens — "
            "the document likely contains more BMPs than the budget allows. "
            "Raise extraction_max_tokens or split the document."
        )

    tool_use = next(
        (b for b in response.content if b.type == "tool_use" and b.name == TOOL_NAME),
        None,
    )
    if tool_use is None:
        types = ", ".join(b.type for b in response.content) or "<empty>"
        raise ExtractionError(
            f"No tool_use block in response (stop_reason={response.stop_reason}, "
            f"blocks=[{types}])"
        )

    # Validate even though strict=True asked the API to guarantee shape: the
    # guarantee is about the JSON Schema, while our Pydantic model additionally
    # enforces enum membership and length caps (SEC-07).
    result = SWPPPExtractionResponse.model_validate(tool_use.input)

    logger.info(
        "swppp extracted",
        extra={
            "bmp_count": len(result.checkpoints),
            "risk_level": result.risk_level.value,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
    )
    return result
