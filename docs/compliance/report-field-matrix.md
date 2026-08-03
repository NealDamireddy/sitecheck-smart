# Inspection Report Field Matrix

Status: inventory template; permit applicability and wording require QSP review.

This matrix defines where each report value originates. A report may only render stored inspection evidence or a frozen report source snapshot. It must not query mutable project state while rendering.

| Report area | Source record | Required behavior | Current gap |
| --- | --- | --- | --- |
| Project identity | Project snapshot on report | Freeze name, WDID, address, permit profile, acreage/type | Generator reads live project row |
| Inspector identity | Inspector snapshot on inspection/report | Freeze name, role, qualification, license, and employer used at approval | Generator resolves current profile |
| Inspection identity | Inspection | Require inspection ID, kind, start/completion times, and requirement link | Generator permits no inspection |
| Forecast evidence | Forecast snapshot | Preserve source URL, retrieval time, intervals, and hash | Generator reads current weather cache |
| QPE information | QPE event snapshot | Preserve evaluated periods, decision, event bounds, and rule version | Generator selects latest SMARTS event |
| Rain gauge | Inspection/QPE evidence | Store reading, observation time, observer, and event link | Partially represented on inspection |
| Checklist answers | `inspection_answers` | Persist each answer; missing remains unanswered | Current rollup can default categories to Yes |
| BMP findings | `inspection_findings` snapshot | Freeze checkpoint name/type/location/source and observation | Finding points to mutable checkpoint |
| Deficiencies | Inspection-linked deficiency snapshot | Only include deficiencies known for this inspection | Generator reads all current active deficiencies |
| Corrective actions | Inspection-linked action snapshot | Preserve state and deadline as of inspection/report approval | Generator reads current outstanding actions |
| Samples | Inspection and QPE-linked samples | Include only samples for the report's event/inspection | Generator selects latest event |
| Photos | Inspection evidence | Preserve object ID, hash, capture time, and signed rendering path | Needs report-level evidence manifest |
| Approval | Report approval | Bind approver and attestation to report content hash | Current signing can be client-only |
| PDF | Frozen report snapshot | Re-rendering an approved revision must not change its content | PDF can depend on mutable report sections |

## Answer states

Allowed checklist answers should be explicit:

- `yes`
- `no`
- `not-applicable` with a reason
- `not-observed` with a reason
- `unanswered`

AI output is a suggestion and must not be stored as the final QSP answer without an affirmative user action.
