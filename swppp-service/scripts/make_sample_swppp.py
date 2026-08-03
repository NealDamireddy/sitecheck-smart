"""Generate a realistic sample SWPPP PDF with a BMP schedule as a real table."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

OUT = Path(__file__).resolve().parents[1] / "fixtures" / "sample_swppp.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()

ROWS = [
    ["BMP Code", "BMP Name", "Category", "Required Locations", "Inspection Frequency", "Maintenance Threshold"],
    ["EC-1", "Scheduling", "Erosion Control", "Entire site", "Weekly", "Revise schedule when rain forecast exceeds 50%"],
    ["EC-7", "Geotextiles & Mats", "Erosion Control", "North slope; East embankment", "Weekly, Pre-Storm",
     "Replace when fabric is torn or displaced more than 6 inches"],
    ["SE-1", "Silt Fence", "Sediment Control", "North perimeter; West property line", "Weekly, Post-Storm",
     "Repair when accumulated sediment reaches 1/3 of fence height"],
    ["SE-5", "Fiber Rolls", "Sediment Control", "South slope contours at 20 ft intervals", "Weekly",
     "Replace when sediment reaches 1/2 roll height or roll is displaced"],
    ["SE-10", "Storm Drain Inlet Protection", "Sediment Control", "All 4 on-site inlets; Main St inlet",
     "Weekly, Pre-Storm, Post-Storm", "Clean when sediment accumulation reaches 1/3 of device capacity"],
    ["TC-1", "Stabilized Construction Entrance", "Tracking Control", "Main gate on Harrison Ave", "Weekly",
     "Add rock when voids fill with sediment or tracking is observed offsite"],
    ["WE-1", "Wind Erosion Control", "Wind Erosion", "Exposed stockpiles; haul roads", "Weekly",
     "Apply water when visible dust leaves the site boundary"],
    ["WM-1", "Material Delivery and Storage", "Materials Management", "Laydown yard, NE corner", "Weekly",
     "Cover and berm within 24 hours of delivery"],
    ["WM-4", "Spill Prevention and Control", "Materials Management", "Fueling area; equipment yard", "Weekly",
     "Deploy spill kit immediately; report spills over 5 gallons"],
    ["NS-1", "Water Conservation Practices", "Non-Storm Water", "All active work areas", "Weekly",
     "Repair leaking equipment within 48 hours of discovery"],
]

def build():
    doc = SimpleDocTemplate(str(OUT), pagesize=letter,
                            leftMargin=0.5*inch, rightMargin=0.5*inch)
    story = [
        Paragraph("STORM WATER POLLUTION PREVENTION PLAN (SWPPP)", styles["Title"]),
        Paragraph("Harrison Avenue Mixed-Use Development", styles["Heading2"]),
        Spacer(1, 10),
        Paragraph("WDID No.: 5S36C401234", styles["Normal"]),
        Paragraph("Risk Level: Level 2", styles["Normal"]),
        Paragraph("QSP of Record: Maria Delgado, QSD/QSP Cert. No. 27841", styles["Normal"]),
        Paragraph("Total Disturbed Area: 4.7 acres", styles["Normal"]),
        Spacer(1, 18),
        Paragraph("Section 5 — Best Management Practices Schedule", styles["Heading2"]),
        Paragraph(
            "The following BMPs shall be installed and maintained for the duration "
            "of construction in accordance with the CGP 2022 (Order WQ 2022-0057-DWQ).",
            styles["Normal"]),
        Spacer(1, 12),
    ]

    body = styles["BodyText"]; body.fontSize = 7; body.leading = 8.5
    head = styles["BodyText"].clone("h"); head.fontSize = 7; head.leading = 8.5; head.textColor = colors.white
    data = [[Paragraph(c, head if i == 0 else body) for c in row] for i, row in enumerate(ROWS)]

    table = Table(data, colWidths=[0.55*inch, 1.15*inch, 1.0*inch, 1.6*inch, 1.1*inch, 2.1*inch], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2F4F4F")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F2F2")]),
    ]))
    story += [table, Spacer(1, 18),
              Paragraph("Section 6 — Spill Response", styles["Heading2"]),
              Paragraph(
                  "Spill kits shall be maintained at the fueling area and the equipment yard. "
                  "Any spill exceeding 5 gallons shall be reported to the QSP immediately and "
                  "to the State Water Board within 24 hours.", styles["Normal"])]
    doc.build(story)
    print(f"wrote {OUT}")

if __name__ == "__main__":
    build()
