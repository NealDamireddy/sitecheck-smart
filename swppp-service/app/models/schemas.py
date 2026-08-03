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

from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

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
    inspection_frequency: InspectionFrequency = Field(
        description="Inspection cadence stated for this BMP."
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


class SWPPPExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    site_wdid: str | None = Field(
        default=None,
        description="Waste Discharge ID. null if the document does not state one.",
    )
    risk_level: RiskLevel = Field(description="CGP risk level stated in the document.")
    qsp_name: str | None = Field(
        default=None, description="QSP contact name. null if not stated."
    )
    checkpoints: list[BMPItemSchema] = Field(
        default_factory=list,
        max_length=500,
        description="Every BMP the document requires.",
    )
