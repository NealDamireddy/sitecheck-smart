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
import re
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

Before recording BMPs, read the document header for the WDID, risk level and \
QSP name. These are usually stated as plain labelled lines near the top, e.g. \
"Risk Level: Level 2" — copy what is printed rather than inferring it from the \
project's size or type.

Rules that matter more than completeness:
- Record only what the document states. If a field is not stated, use null or \
an empty list. Never infer a location, a frequency, or a threshold.
- Record EVERY row of every BMP schedule table. A table with ten rows is ten \
BMPs; do not summarise, group or stop early.
- A cell listing several inspection triggers ("Weekly, Pre-Storm, Post-Storm") \
is several entries in inspection_frequency, not one. Dropping one silently \
removes a required inspection from the compliance schedule.
- This output becomes a legal compliance record. An invented requirement is \
worse than a missing one.
- Quote maintenance thresholds in the document's own terms.
- Call the tool exactly once, with every BMP you found."""


#: Validation keywords strict tool use rejects. Pydantic emits them from our
#: field constraints (`max_length` on a list becomes `maxItems`, on a str
#: becomes `maxLength`), and sending one returns:
#:   400 tools.0.custom: For 'array' type, property 'maxItems' is not supported
#:
#: Stripping them costs nothing: `model_validate()` re-checks every constraint
#: against the returned input, so the SEC-07 length caps are still enforced —
#: they are simply enforced on our side rather than declared to the API.
_UNSUPPORTED_KEYWORDS = frozenset(
    {
        "maxItems", "minItems", "uniqueItems",
        "maxLength", "minLength", "pattern", "format",
        "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    }
)


def _strict_schema(model: type) -> dict[str, Any]:
    """
    Pydantic JSON Schema, hardened for strict tool use.

    Two passes over the whole tree, including nested `$defs` — hardening only
    the top level would silently leave the BMP items unconstrained, which is
    the part that matters most:

      1. add `additionalProperties: false` + an explicit `required` list
      2. drop the validation keywords the API rejects
    """
    schema = model.model_json_schema()

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                # EVERY property must be required, overwriting what Pydantic
                # emitted. Pydantic marks a field optional whenever it has a
                # default, so it produced required:["risk_level"] alone — and
                # under strict mode that made omitting `checkpoints` legal.
                # The model duly returned {"risk_level": "..."} and nothing
                # else: strictness applied to a permissive schema made it
                # EASIER to return nothing. Optionality is expressed by the
                # nullable type (`str | None`), never by absence from this list.
                node["required"] = sorted(node["properties"].keys())
            for keyword in _UNSUPPORTED_KEYWORDS & node.keys():
                del node[keyword]
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return schema


class ExtractionError(RuntimeError):
    """Extraction did not produce a usable result. Never silently swallowed."""


#: A BMP code like EC-1, SE-10, WM-4, TC-1, NS-3 — the CGP's own numbering.
#: Its presence in the source means the document does describe BMPs, so an
#: empty extraction is a failure rather than an honest "this SWPPP has none".
_BMP_CODE = re.compile(r"\b(EC|SE|TC|WE|WM|NS)-\d{1,2}\b")


def bmp_codes_in_source(markdown: str) -> set[str]:
    """Every BMP code the document itself mentions — the completeness target."""
    return {m.group(0).upper() for m in _BMP_CODE.finditer(markdown)}


MAX_ATTEMPTS = 3


async def extract_swppp(
    markdown: str, *, settings: Settings, client: AsyncAnthropic | None = None
) -> SWPPPExtractionResponse:
    """
    Extract, retrying while the result is demonstrably incomplete.

    Measured over 8 runs on byte-identical input: six returned all 10 BMPs,
    one returned 1, and one returned 0. A partial result is the dangerous
    one — an empty extraction looks broken, but storing 1 of 10 BMPs looks
    like a successfully ingested SWPPP whose compliance schedule silently
    omits nine required inspections. Same class of harm as AI-02.

    So completeness is checked against the document rather than trusted: every
    BMP code appearing in the source must appear in the result. At roughly 75%
    per attempt, three attempts put this near 98%, and the usual case still
    costs exactly one call.
    """
    client = client or AsyncAnthropic(api_key=settings.anthropic_api_key)
    expected = bmp_codes_in_source(markdown)

    best: SWPPPExtractionResponse | None = None
    best_missing: set[str] = set()

    for attempt in range(1, MAX_ATTEMPTS + 1):
        result = await _extract_once(markdown, settings=settings, client=client)
        missing = expected - {c.bmp_code.upper() for c in result.checkpoints}

        if best is None or len(result.checkpoints) > len(best.checkpoints):
            best, best_missing = result, missing

        if not missing:
            if attempt > 1:
                logger.info("extraction complete on attempt %d", attempt)
            return result

        logger.warning(
            "attempt %d/%d incomplete: %d/%d BMPs, missing %s",
            attempt, MAX_ATTEMPTS, len(result.checkpoints), len(expected),
            ", ".join(sorted(missing)),
        )

    # Never store a partial result as though it were complete.
    raise ExtractionError(
        f"Incomplete after {MAX_ATTEMPTS} attempts: found "
        f"{len(best.checkpoints) if best else 0} of {len(expected)} BMPs, "
        f"missing {', '.join(sorted(best_missing))}. Nothing was saved. "
        "Inspect the converted Markdown (--save-md); if the BMP table did not "
        "survive conversion, try PDF_BACKEND=marker."
    )


async def _extract_once(
    markdown: str, *, settings: Settings, client: AsyncAnthropic
) -> SWPPPExtractionResponse:

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
            # Optional since the quote-then-parse change: a document that never
            # states a risk level yields None, and `.value` on it crashed the
            # whole extraction from inside a log line.
            "risk_level": result.risk_level.value if result.risk_level else None,
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
    )
    return result
