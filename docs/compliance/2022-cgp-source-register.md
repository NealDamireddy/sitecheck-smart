# 2022 California Construction General Permit Source Register

Status: engineering baseline; QSP/legal review required before production use.

This register identifies the primary sources SiteCheck uses for compliance behavior. Product documentation, code comments, tests, and customer-facing claims must trace back to one of these sources. Summaries in this repository are not a substitute for the adopted permit.

## Controlling and interpretive sources

| ID | Source | Use in SiteCheck | Status |
| --- | --- | --- | --- |
| CGP-2022 | [Order WQ 2022-0057-DWQ](https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction/general_permit_reissuance.html) | Controlling permit and attachments | Primary authority |
| CGP-FAQ | [2022 CGP FAQ](https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction/cgp-faq.html) | Current Water Boards explanations of QPE and inspection requirements | Official guidance |
| QPE-GUIDE | [2022 CGP Qualifying Precipitation Event Guidance](https://www.waterboards.ca.gov/water_issues/programs/stormwater/construction/docs/2022-cgp-qpe.pdf) | Forecast source, QPE thresholds, event continuation, inspection timing, and worked examples | Official guidance |
| ATT-D | [Attachment D](https://water.waterboards.ca.gov/water_issues/programs/stormwater/construction/docs/2022-0057-dwq-with-attachments/cgp2022_att_d.pdf) | Traditional construction requirements by risk level | Primary authority |
| ATT-E | [Attachment E](https://water.waterboards.ca.gov/water_issues/programs/stormwater/construction/docs/2022-0057-dwq-with-attachments/cgp2022_att_e.pdf) | Linear underground/overhead project requirements and exceptions | Primary authority |
| SMARTS | [SMARTS resources](https://www.waterboards.ca.gov/water_issues/programs/stormwater/smarts/) | Portal roles, electronic reporting, and CROMERR context | Official guidance |
| NWS-API | [National Weather Service API](https://www.weather.gov/documentation/services-web-api) | Official point, hourly, and raw grid forecast retrieval | Primary data source |

## Engineering rules

1. Store the exact source ID and SiteCheck rule version with each derived compliance decision.
2. Preserve the NWS forecast used for each inspection; a mutable weather cache is not regulatory evidence.
3. Treat missing or malformed compliance inputs as `unknown`, never as compliant or not required.
4. Keep permit requirements separate from product recommendations. Product recommendations must be labeled as such.
5. A practicing California QSP must review the rule matrix before `CGP_RULES_V2_ENABLED` can be enabled in production.
6. Normalize compliance forecasts from the NWS six-hour Weather Table concepts; calendar-day aggregation is display-only and cannot drive a QPE decision.

## Open questions requiring expert review

- Exact applicability and exceptions for Risk Level 1 and Risk Type 1 linear projects.
- Inactive-site inspection combinations and safe/infeasible-access exceptions.
- Whether a weekly inspection can satisfy a monthly QSP, pre-QPE, during-QPE, or post-QPE requirement in each supported circumstance.
- Exact corrective-action clocks and evidence requirements for each deficiency class.
- The canonical checklist fields and section mapping for Traditional versus Linear projects.
- Signature/approval language that may be shown in SiteCheck without implying SMARTS certification.
