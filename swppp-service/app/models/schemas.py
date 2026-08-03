"""
Extraction contract.

Your schemas, with three changes — each one a defect the main app already paid
for and wrote a test about:

  1. `bmp_category` is an enum, not a free string. The web app's
     `checkpoints.bmp_type` has a six-value CHECK constraint, and Zod, the DB
     and TypeScript disagreeing about that list was DRF-01. A free string here
     regenerates the same drift from a new direction: extraction would happily
     produce "Erosion Control" and the INSERT would fail on 'erosion-control'.
     `to_db_bmp_type()` does the mapping explicitly, in one place.
  2. Hard length caps on every string. Model output is untrusted input (SEC-07)
     — a SWPPP is a customer-supplied document that reaches a prompt, so an
     injected instruction must not be able to smuggle an unbounded string into
     Postgres or the UI.
  3. `risk_level` is an enum. It drives post-storm inspection deadlines
     (48h for RL1, 24h for RL2/3); a typo'd free string silently produces the
     wrong legal deadline.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Short = Annotated[str, StringConstraints(min_length=1, max_length=200, strip_whitespace=True)]
Medium = Annotated[str, StringConstraints(min_length=1, max_length=500, strip_whitespace=True)]


class BmpCategory(str, Enum):
    """Mirrors DB_BMP_TYPES in ../../src/lib/cgp/bmp-types.ts."""

    EROSION_CONTROL = "erosion-control"
    SEDIMENT_CONTROL = "sediment-control"
    TRACKING_CONTROL = "tracking-control"
    WIND_EROSION = "wind-erosion"
    MATERIALS_MANAGEMENT = "materials-management"
    NON_STORM_WATER = "non-storm-water"


class RiskLevel(str, Enum):
    LEVEL_1 = "Level 1"
    LEVEL_2 = "Level 2"
    LEVEL_3 = "Level 3"
    LUP = "LUP"


class InspectionFrequency(str, Enum):
    WEEKLY = "Weekly"
    PRE_STORM = "Pre-Storm"
    DURING_STORM = "During-Storm"
    POST_STORM = "Post-Storm"
    QUARTERLY = "Quarterly"
    OTHER = "Other"


class BMPItemSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    bmp_category: BmpCategory = Field(
        description=(
            "One of the six CGP BMP categories, lowercase-hyphenated exactly "
            "as listed. Map the document's wording onto the closest category."
        )
    )
    bmp_code: Short = Field(
        description="California BMP code, e.g. EC-1, SE-1, WM-1, TC-1, NS-3."
    )
    title: Short = Field(description="BMP name, e.g. Fiber Rolls, Silt Fence.")
    required_locations: list[Medium] = Field(
        default_factory=list,
        max_length=50,
        description=(
            "Site locations where this BMP must be installed or inspected, as "
            "stated in the document. Empty list if the document does not say — "
            "never invent a location."
        ),
    )
    inspection_frequency: list[InspectionFrequency] = Field(
        description=(
            "EVERY inspection trigger listed for this BMP, as a list. SWPPP "
            "tables routinely give several — 'Weekly, Pre-Storm, Post-Storm' "
            "is three entries, not one. Never collapse them to a single value."
        )
    )
    maintenance_threshold: Medium = Field(
        description=(
            "The actionable trigger condition, e.g. 'Repair when sediment "
            "reaches 1/3 height'. Quote the document's threshold."
        )
    )

    def to_db_bmp_type(self) -> str:
        """The value `checkpoints.bmp_type` will accept. Single mapping point."""
        return self.bmp_category.value


def parse_risk_level(text: str | None) -> RiskLevel | None:
    """
    Derive the risk level from the document's own words.

    Measured on the sample SWPPP: the model quotes the right line 5/5 times
    but classifies it correctly only 4/5 — one run held
    'Risk Level: Level 2' and still answered 'LUP'. Finding the text is a
    language task the model is reliable at; turning "Level 2" into an enum is
    a parse, and a parse belongs in code. So we ignore the model's own
    classification whenever we can read the quote ourselves.

    An explicit "Level N" wins over a "LUP" mention: a LUP's SWPPP may discuss
    both, and the numbered level is the one that sets the deadline.
    """
    if not text:
        return None
    lowered = text.lower()
    match = re.search(r"\blevel\s*([123])\b", lowered)
    if match:
        return RiskLevel(f"Level {match.group(1)}")
    if re.search(r"\blup\b|linear underground|linear overhead", lowered):
        return RiskLevel.LUP
    return None


class SWPPPExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_wdid: str | None = Field(
        default=None,
        description="Waste Discharge ID. null if the document does not state one.",
    )
    # ORDER MATTERS. Generation is autoregressive and follows property order,
    # so the quote is produced BEFORE the classification — the model has to
    # find the actual text before choosing an enum value. Classifying first
    # scored 3/5 on a document that plainly states "Risk Level: Level 2"; the
    # two failures both returned "LUP", i.e. the model guessed from project
    # type instead of reading. Quote-then-classify is the fix.
    risk_level_source_text: str | None = Field(
        default=None,
        max_length=300,
        description=(
            "The exact sentence or line stating the risk level, copied "
            "verbatim from the document — e.g. 'Risk Level: Level 2'. Find "
            "this text before answering risk_level. null only if the document "
            "genuinely never states a risk level."
        ),
    )
    risk_level: RiskLevel | None = Field(
        default=None,
        description=(
            "The risk level from risk_level_source_text above. If that quote "
            "says 'Level 2', answer 'Level 2'. Choose 'LUP' ONLY when the "
            "document explicitly calls itself a Linear Underground/Overhead "
            "Project — never as a fallback. Do not infer from project type or "
            "acreage. null when no source text was found. This drives "
            "post-storm inspection deadlines (48h Level 1, 24h Levels 2-3), "
            "so a guess produces a wrong legal deadline."
        ),
    )
    qsp_name: str | None = Field(
        default=None, description="QSP contact name. null if not stated."
    )
    checkpoints: list[BMPItemSchema] = Field(
        default_factory=list,
        max_length=500,
        description="Every BMP the document requires.",
    )

    @model_validator(mode="after")
    def _derive_risk_level_from_quote(self) -> "SWPPPExtractionResponse":
        """
        Prefer the parsed quote over the model's own classification.

        This is deliberately an override, not a cross-check that raises: the
        quote is the document's own words, so when the two disagree the quote
        is right by definition. Re-raising would fail an ingestion that has
        perfectly good data sitting in `risk_level_source_text`.
        """
        parsed = parse_risk_level(self.risk_level_source_text)
        if parsed is not None and parsed != self.risk_level:
            object.__setattr__(self, "risk_level", parsed)
        return self
