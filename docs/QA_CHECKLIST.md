# SiteCheck — Pre-Release QA Checklist

Hand this to anyone; it should be executable without asking questions. Everything here is what the automated suites **cannot** prove: real devices, real documents, real weather, and the real SMARTS portal.

Before starting, run the automated gates and record the result:

```bash
npm run build && npm test && npm run test:security
```

| Gate | Expected | Result |
|---|---|---|
| `npm run build` | Compiles, no errors | ☐ |
| `npm test` | All green | ☐ |
| `npm run test:security` | All green | ☐ |
| `cd smarts-automation && npm test` | All green | ☐ |

---

## 1. Accounts and access

- [ ] **Sign up** with a fresh email. You land on a "check your email" screen.
- [ ] The confirmation email arrives within 2 minutes and its link signs you in.
- [ ] **Forgot password** from `/login` sends a reset email; the link lets you set a new password; the new password works and the old one does not.
- [ ] A reset link **used twice** shows "Link expired," not a crash.
- [ ] **Change password** on the Account page; sign out; the new password works.
- [ ] Sign out, then paste a `/dashboard` URL — you are redirected to `/login`.
- [ ] In devtools, set cookie `sitecheck_demo=1` on the **production** site and reload `/dashboard`. You must still be redirected to login. *(If you get in, SEC-03 has regressed — stop the release.)*

## 2. Tenant isolation — the one a customer will ask about

Needs two accounts (A and B) with a project each.

- [ ] As B, open A's project URL directly (`/projects/<A-project-id>/events`). You must not see A's site name, checkpoints, or samples.
- [ ] As B, open devtools → Network, and call `/api/projects`. A's project is absent from the response.
- [ ] As B, request `/api/checkpoints?projectId=<A-project-id>`. Empty array.
- [ ] As B, open a photo URL copied from A's checkpoint detail page. **Expected once the bucket flip lands: denied.** *(Today this may still load — track SEC-01 in `docs/CODE_REVIEW.md`.)*
- [ ] Sign out entirely and re-open both URLs above. Redirect / 401, never data.

## 3. SWPPP upload and checkpoint extraction

Use a **real** SWPPP PDF (100+ pages), not the sample.

- [ ] Upload at `/swppp`. Progress is visible; the page never looks frozen.
- [ ] Extraction finishes and lists checkpoints with BMP codes (SC-, EC-, TC-…).
- [ ] Spot-check five extracted checkpoints against the document. Names and BMP types are right.
- [ ] Checkpoints the document gave **no** coordinates for appear near the project center and can be dragged to their true positions. *(They must NOT appear in Fresno unless the site is in Fresno — that was AI-01.)*
- [ ] Upload a **scanned/image-only** PDF. You get a clear "needs OCR" message, not a silent failure.
- [ ] Upload a non-PDF and a 60 MB file. Both are refused with a readable reason.

## 4. Field walkthrough — do this outdoors, on a phone

The real user is standing on a muddy site, in sunlight, possibly one bar of signal, wearing gloves.

- [ ] Start an inspection on an actual phone (not desktop devtools emulation).
- [ ] Screen is readable **in direct sunlight** at full brightness.
- [ ] Every button you need can be hit with a **gloved thumb**, one-handed.
- [ ] Capture a photo: time from tapping "add photo" to being back in the flow is **under 5 seconds** on cellular. Record the actual time: ______
- [ ] The AI analysis appears as an **editable draft** with a visible confidence value, not as a finished verdict.
- [ ] Edit an AI observation. Your edit is what gets saved.
- [ ] **Interruption test:** halfway through, lock the phone for 2 minutes, reopen the app. Progress is preserved, or there is an explicit "unsaved" warning. Record which: ______
- [ ] **Airplane-mode test:** enable airplane mode mid-inspection, tap through two checkpoints, then re-enable signal. Nothing is silently lost; the app says what happened.
- [ ] Kill the app entirely mid-inspection and reopen. Note exactly what survived: ______

## 5. Weather and qualifying events

The QPE pipeline was rebuilt on NOAA observations; verify it against reality.

- [ ] Dashboard weather matches an independent source (weather.gov for the **site's** coordinates) — temperature within a few degrees, conditions comparable.
- [ ] Two projects in **different regions** show different weather. *(Both showing the same city was the original bug.)*
- [ ] Wind speed is plausible (not ~2× what weather.gov reports — that was the double-conversion bug).
- [ ] After a real rain event of ≥0.5″ at a site, a qualifying event is detected and a post-storm inspection is prompted within the expected window. Record date, site, and observed inches: ______
- [ ] The deadline shown counts from when the rain **ended**, and is 48 h (Risk Level 1) or 24 h (Risk Level 2/3).
- [ ] If the nearest NOAA station lacks precipitation data, the UI says the data is sparse rather than reporting a confident 0.00″.

## 6. Sampling and NAL

- [ ] Record a sample with pH 7.2 and turbidity 100 NTU → no exceedance flag.
- [ ] Record turbidity **exactly 250** → no flag. Record **251** → flagged.
- [ ] Record pH exactly **6.0** and exactly **9.0** → no flag. **5.9** and **9.1** → flagged.
- [ ] Try to save a reading with qualifier **ND** and a result value → rejected with a readable message.
- [ ] Try **DNQ** without an RL → rejected.
- [ ] Re-save a sample with corrected numbers. The previous readings are replaced, and **nothing is lost** if you refresh mid-save.

## 7. Reports — the legal artifact

- [ ] Generate a report from a completed inspection.
- [ ] Practitioner name, **license number**, and company match your Account page — not a stale copy. *(Change your license number on the Account page, regenerate, and confirm the new number appears. That was ACC-02.)*
- [ ] The report contains Part I (General Information), Part II (BMP observations), Part III (Deficiencies), Part VII (Corrective Actions), and a signature block.
- [ ] A recorded deficiency appears in Part III with the 72-hour repair note.
- [ ] Download the PDF. It opens in Preview/Acrobat, pages are not clipped, photos render.
- [ ] Nothing in the report claims to be signed or certified that you did not sign.

## 8. SMARTS sync — dry run on a TEST account only

**Never run this against a real permit during QA.** Use a SMARTS test account.

- [ ] Save SMARTS credentials on the Account page. Reload — the password is never displayed back.
- [ ] Launch Sync to SMARTS for a completed event. The browser window opens and fills the Ad Hoc Monitoring Report.
- [ ] **The bot stops at the Certification screen.** It must never check the attestation box or click Certify. *(If it ever does, stop the release immediately — this is the product's core legal invariant.)*
- [ ] The run status shows "stopped before certification" and the certification screenshot is viewable.
- [ ] Values in SMARTS match the app: units are `SU` / `NTU`, methods match SMARTS' exact option text, the date/time is right.
- [ ] Certify manually in SMARTS yourself and confirm the filing is accepted.
- [ ] As a **different** user, try to open the first user's job status URL — you get "not found."

## 9. Error and empty states

For each: unplug the network or use devtools throttling to force the failure.

- [ ] SWPPP extraction failure → tells you what to do next.
- [ ] Photo analysis failure → says nothing was saved, and nothing was.
- [ ] Weather fetch failure → dashboard still renders.
- [ ] Report generation failure → readable message, no half-written report.
- [ ] A brand-new account with no projects sees a useful empty state, not a blank page.
- [ ] No error anywhere shows a stack trace, SQL, or a table name.

## 10. Release sign-off

| | Name | Date |
|---|---|---|
| Tester | | |
| Reviewed by (Aryav) | | |

**Blocking issues found:** _______________________________________________

**Known-accepted issues for this release** (must be listed in `docs/FOLLOW_UP.md`): _______________________________________________
