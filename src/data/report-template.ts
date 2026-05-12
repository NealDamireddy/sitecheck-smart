import { ReportSection } from '@/types/report';

export const reportSections: ReportSection[] = [
  {
    id: 'site-info',
    number: 1,
    title: 'Site Information',
    content: `Project Name: Riverside Commercial \u2014 Phase 2
Site Address: 4200 Riverside Blvd, Fresno, CA 93722
WDID Number: 5B39C123456
CGP Permit Number: CAS000001
Risk Level: 2
Total Disturbed Acreage: 12.4 acres
Project Phase: Active Construction \u2014 Grading, Utilities & Foundations
Qualified SWPPP Practitioner (QSP): Sarah Chen, QSP-4521
QSP Company: Pacific Environmental Consulting
QSP Contact: (559) 555-0142 | schen@pacenviro.com
Legally Responsible Person (LRP): Riverside Development Group, LLC
Project Start Date: September 15, 2025
Estimated Completion: March 1, 2027
SWPPP Preparation Date: August 28, 2025
SWPPP Amendment: #4 (March 27, 2026)`,
    editable: true,
  },
  {
    id: 'inspection-details',
    number: 2,
    title: 'Inspection Details',
    content: `Inspection Date: March 28, 2026
Inspection Type: Routine Weekly Inspection (AI-Assisted Drone Survey)
Inspector: Sarah Chen, QSP-4521
Survey Method: DJI Matrice 350 RTK drone with 45MP Zenmuse P1 camera, AI-powered image analysis
Mission ID: MISSION-001 (Alpha Survey \u2014 Full Site)
Flight Altitude: 120 ft AGL
Flight Duration: 42 minutes
Waypoints Surveyed: 34 of 34 (100% coverage)
Weather at Time of Flight: Clear, 68\u00b0F, Wind 6 mph NW, Humidity 42%
Previous Inspection Date: March 13, 2026 (Routine)
Days Since Last Inspection: 15
Qualifying Precipitation Events Since Last Inspection: None
Upcoming QPE Forecast: April 2, 2026 \u2014 0.62 inches expected (pre-storm inspection recommended April 1)`,
    editable: true,
  },
  {
    id: 'weather-conditions',
    number: 3,
    title: 'Weather Conditions',
    content: `Current Conditions (March 29, 2026): Partly cloudy, 72\u00b0F, Wind 8 mph NW, Humidity 45%

Precipitation Record (Past 7 Days):
\u2022 March 22\u201328: 0.00 inches total. No precipitation events recorded.

7-Day Forecast:
\u2022 March 29\u201331: Clear to partly cloudy. Highs 73\u201376\u00b0F. No precipitation expected.
\u2022 April 1: Light rain likely. 0.30 inches expected. Winds increasing to 14 mph from the south.
\u2022 April 2: Heavy rain. 0.62 inches expected. This constitutes a Qualifying Precipitation Event (QPE). Winds 18 mph SSE.
\u2022 April 3: Lingering light rain. 0.15 inches. Conditions improving.
\u2022 April 4: Clearing. Partly cloudy, highs near 68\u00b0F.

QPE Forecast Action: A post-storm inspection shall be conducted within 24 hours following the cessation of the April 2\u20133 storm event, per CGP Section XI.A.3. Pre-storm BMP verification inspection recommended for April 1.

Historical QPE Events (Past 60 Days):
\u2022 QPE-2026-001: February 10\u201311, 2026 \u2014 0.78 inches. Post-storm inspection INS-003 completed February 12.
\u2022 QPE-2026-002: March 4\u20135, 2026 \u2014 0.55 inches. Post-storm inspection INS-005 completed March 6.

Rain Gauge: Onset HOBO RG3-M, calibrated March 29, 2026. Resolution: 0.01 inches.`,
    editable: true,
  },
  {
    id: 'bmp-status',
    number: 4,
    title: 'BMP Status Summary',
    content: `Total BMPs Inspected: 34

Status Summary:
\u2022 Compliant: 28 (82.4%)
\u2022 Deficient: 3 (8.8%)
\u2022 Needs Review: 3 (8.8%)

Overall Site Compliance Score: 82%

Category Breakdown:
\u2022 Sediment Control (SC-1 through SC-8): 7 compliant, 1 deficient (SC-3)
\u2022 Erosion Control (EC-1 through EC-7): 6 compliant, 1 needs review (EC-5)
\u2022 Tracking Control (TC-1 through TC-4): 3 compliant, 1 needs review (TC-2)
\u2022 Wind Erosion (WE-1 through WE-3): 2 compliant, 1 needs review (WE-1)
\u2022 Materials Management (MM-1 through MM-7): 6 compliant, 1 deficient (MM-4)
\u2022 Non-Storm Water (NS-1 through NS-5): 4 compliant, 1 deficient (NS-2)

Needs-Review Items Requiring Field Verification:
\u2022 EC-5 (Hydroseeding \u2014 South Berm): AI imagery shows inconsistent germination (55\u201370%). Field walkdown needed to verify actual coverage percentage against 70% threshold.
\u2022 TC-2 (Tire Wash Station \u2014 Secondary Exit): Water supply hose may be disconnected. Recirculation basin shows elevated sediment. Field verification of operational status required.
\u2022 WE-1 (Watering Schedule \u2014 Active Grading): Central pad area appeared dry during afternoon drone pass. Water truck schedule compliance needs field verification.`,
    editable: true,
  },
  {
    id: 'deficiency-log',
    number: 5,
    title: 'Deficiency Log & Corrective Actions',
    content: `Active Deficiencies: 3

DEF-001 \u2014 Sediment Basin SC-3 (Southwest Outfall)
\u2022 Detected: March 28, 2026, 2:23 PM
\u2022 CGP Violation: Section X.H.2.b \u2014 Sediment Basin Maintenance
\u2022 Description: Outlet riser pipe partially blocked with debris (~40% obstruction). Accumulated sediment exceeds 50% design depth marker. Perforated decant holes on lower riser section are fully buried. Emergency spillway within 8 inches of engagement.
\u2022 Corrective Action: Remove debris from outlet structure. Perform full sediment cleanout to restore design capacity. Verify post-cleanout discharge rates. Install upstream debris rack.
\u2022 Deadline: March 31, 2026
\u2022 Status: Open
\u2022 Priority: High

DEF-002 \u2014 Concrete Washout MM-4 (West Retaining Wall Area)
\u2022 Detected: March 28, 2026, 2:45 PM
\u2022 CGP Violation: Section X.H.6.a \u2014 Concrete Washout Containment
\u2022 Description: Prefabricated steel washout container is overflowing. High-pH wash water has pooled 8\u201310 feet beyond containment boundary. Alkaline staining on surrounding soil indicates repeated overflow. Potential discharge pathway to storm drain SD-2 approximately 60 feet downslope.
\u2022 Corrective Action: Pump out container immediately. Clean up pooled wash water. Install temporary containment berm (sandbags). Increase cleanout frequency. Evaluate upsizing the facility.
\u2022 Deadline: March 30, 2026
\u2022 Status: Open
\u2022 Priority: High

DEF-003 \u2014 Dewatering Discharge NS-2 (Utility Trench)
\u2022 Detected: March 28, 2026, 3:10 PM
\u2022 CGP Violation: Section X.H.7.a \u2014 Non-Storm Water Discharge Limits
\u2022 Description: Dewatering discharge from sanitary sewer trench excavation recorded 280 NTU at most recent sampling, exceeding the 250 NTU threshold. Filter bag system appears clogged with fine-grained soils. Turbid standing water observed 15 feet downstream of filter bags.
\u2022 Corrective Action: Cease discharge until compliant. Replace filter bags. Add secondary treatment (chitosan flocculation or Baker tank routing). Sample every 4 hours until three consecutive readings below 250 NTU.
\u2022 Deadline: March 30, 2026
\u2022 Status: Open
\u2022 Priority: High

Previous Deficiencies (Resolved):
\u2022 No unresolved deficiencies from prior inspections. All previously identified items have been corrected and verified.`,
    editable: true,
  },
  {
    id: 'certification',
    number: 6,
    title: 'Certification Statement',
    content: `I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gather and evaluate the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete.

I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.

This inspection was conducted in accordance with the requirements of the California Construction General Permit (CGP) Order 2022-0057-DWQ, NPDES No. CAS000002.

All Best Management Practices (BMPs) identified in the Storm Water Pollution Prevention Plan (SWPPP) for this project have been inspected and their status has been documented in this report. Deficiencies identified during this inspection have been logged with corrective action plans and deadlines in accordance with CGP Section XII.B.

This report was generated with the assistance of AI-powered drone imagery analysis. All AI-identified deficiencies and needs-review items are subject to field verification by the QSP prior to final certification.`,
    editable: false,
  },
  {
    id: 'signature',
    number: 7,
    title: 'QSP Signature Block',
    content: `Qualified SWPPP Practitioner (QSP):
Name: Sarah Chen
License Number: QSP-4521
Company: Pacific Environmental Consulting
Phone: (559) 555-0142
Email: schen@pacenviro.com

Signature: ___________________________

Date: ___________________________

Report ID: RPT-2026-03-28-001
Inspection ID: INS-005
Generated: March 29, 2026`,
    editable: false,
  },
];
