// Recognise whether a draft Ad Hoc report for this WDID + event already exists
// in SMARTS's "Ad Hoc Reports - Outstanding" table. The orchestrator uses this
// to RESUME an existing draft instead of always creating a new one, which would
// accumulate duplicate "Not Submitted" reports for the same precipitation event.
//
// The outstanding table lives on the Ad Hoc Reports list page (the same page
// that hosts the "Start Ad Hoc Report" button). Its DOM shape — verified live
// against the SMARTS UI for a real account that already had 7 drafts for one
// event:
//
//   tbody#noiReadyForm:adhocOutstandingTable_data
//     > tr[data-ri="0"]
//        td[0] <a id="noiReadyForm:adhocOutstandingTable:0:noiReadyListTable5EventIdLink">1374063</a>
//        td[1] "Construction"
//        td[2] "1400 Foothill LLC ... " (Operator/Owner)
//        td[3] "Equus Ct ... " (Facility/Site Name)
//        td[4] "Not Submitted"
//        td[5] "Yes"
//        td[6] "05/27/2026 - 05/29/2026" (Reporting Period)
//        td[7] "Precipitation Event"
//        td[8] "" or "05/29/2026 08:00:00" (Sample Date)
//        td[9] "" (Delete Report cell)
//
// The j_idt### column ids are auto-generated and drift, but the rows are scanned
// positionally — column INDEX is stable across SMARTS revisions.

import type { Page } from "playwright";

export interface DraftResumeKey {
  // The site Facility name as displayed on the FIRST line of the
  // "Facility/Site Name & Address" cell (e.g. "Equus Ct"). The cell renders the
  // name and address as <br>-separated lines; we extract the name line in the
  // browser and compare it EXACTLY (case-insensitive, whitespace-normalized).
  // A substring match against the whole cell was rejected because addresses can
  // contain other sites' names (Equus Ct's own address is "4002 Equus Ct").
  siteName: string;
  // Formatted reporting period, "MM/DD/YYYY - MM/DD/YYYY" with single spaces
  // (e.g. "05/27/2026 - 05/29/2026"). Compared after whitespace normalization
  // on both sides.
  reportingPeriod: string;
  // The Event Type cell value (e.g. "Precipitation Event"). Compared verbatim
  // after trim.
  eventType: string;
}

export interface DraftMatch {
  // SMARTS-assigned report id (the link text, e.g. "1374063").
  reportId: string;
  // The full element id of the report-id anchor — selectable via [id="..."].
  linkElementId: string;
  // The data-ri row index (for diagnostics).
  rowIndex: number;
}

// Tag for the diagnostic log line.
const TAG = "[resume]";

/**
 * Scan the Ad Hoc Reports - Outstanding table for drafts matching `key`. The
 * scan runs entirely in the browser (single page.evaluate) for speed and to
 * avoid Playwright locator round-trips per row.
 *
 * Returns ALL matching rows (callers decide on multi-match behavior). Returns
 * an empty array when:
 *  - the outstanding table is absent or empty, OR
 *  - no row matches the key.
 *
 * Never throws — if the evaluate itself fails (e.g. page navigated away), the
 * caller gets an empty array and we log the reason.
 */
export async function findExistingDraft(
  page: Page,
  key: DraftResumeKey,
): Promise<DraftMatch[]> {
  let rows: OutstandingRow[] = [];

  try {
    // IMPORTANT: this callback is serialized and run in the browser, so it must
    // be a plain inline arrow with no named inner helpers (tsx/esbuild's
    // __name wrapper is undefined in the page context). See primefaces.ts for
    // the same pitfall.
    rows = (await page.evaluate(() => {
      const tbody = document.getElementById(
        "noiReadyForm:adhocOutstandingTable_data",
      );
      if (!tbody) return [];
      const trs = Array.from(tbody.querySelectorAll("tr[data-ri]"));
      return trs.map((tr) => {
        const tds = Array.from(tr.querySelectorAll("td"));
        const link = tds[0] ? tds[0].querySelector("a") : null;
        // The Facility cell is "<name><br><address line(s)>". Take the text
        // nodes BEFORE the first <br> as the facility name — robust even if
        // SMARTS reformats source whitespace. Fall back to the full text when
        // the cell has no <br> at all.
        let facilityName = "";
        const facilityCell = tds[3];
        if (facilityCell) {
          for (const n of Array.from(facilityCell.childNodes)) {
            if (n.nodeType === 1 && (n as Element).tagName === "BR") break;
            facilityName += n.textContent || "";
          }
          if (facilityName.trim() === "") {
            facilityName = facilityCell.textContent || "";
          }
        }
        return {
          rowIndex: Number(tr.getAttribute("data-ri") ?? "-1"),
          facilityName: facilityName,
          reportingPeriod: tds[6] ? (tds[6].textContent || "").trim() : "",
          eventType: tds[7] ? (tds[7].textContent || "").trim() : "",
          reportId: link ? (link.textContent || "").trim() : "",
          linkElementId: link ? link.id || "" : "",
        };
      });
    })) as OutstandingRow[];
  } catch (e) {
    console.log(
      `${TAG} outstanding-table scan failed (${
        e instanceof Error ? e.message : String(e)
      }); treating as no existing drafts.`,
    );
    return [];
  }

  if (rows.length === 0) {
    console.log(
      `${TAG} outstanding table empty or absent; no resume candidates.`,
    );
    return [];
  }

  const matches = matchOutstandingRows(rows, key);

  console.log(
    `${TAG} scanned ${rows.length} outstanding draft(s); ${matches.length} match(es) for ` +
      `site="${key.siteName}" period="${key.reportingPeriod}" type="${key.eventType}"` +
      (matches.length > 0
        ? ` -> [${matches.map((m) => m.reportId).join(", ")}]`
        : ""),
  );
  if (matches.length === 0) {
    // A zero-match miss caused by a misspelled SMARTS_SITE_NAME silently
    // creates ANOTHER duplicate draft — exactly what this guard exists to
    // prevent. Log the facility names actually present so run.log shows why
    // nothing matched.
    const seen = [...new Set(rows.map((r) => normalizeWhitespace(r.facilityName)))];
    console.log(
      `${TAG} facility names present in the outstanding table: [${seen.join(" | ")}] — ` +
        `siteName must EXACTLY match one of these (case-insensitive) to resume.`,
    );
  }
  return matches;
}

/** One scanned row of the outstanding table (shape returned by the page scan). */
export interface OutstandingRow {
  rowIndex: number;
  /** First line of the Facility/Site Name & Address cell (the site name). */
  facilityName: string;
  reportingPeriod: string;
  eventType: string;
  reportId: string;
  linkElementId: string;
}

/**
 * Pure matching logic, split from the page scan so it is unit-testable.
 * A row matches when:
 *  - its facility NAME line equals `key.siteName` (case-insensitive,
 *    whitespace-normalized) — exact, never substring, so one site's name
 *    appearing inside another row's address can not collide;
 *  - its reporting period equals `key.reportingPeriod` after whitespace
 *    normalization on both sides;
 *  - its event type equals `key.eventType` after trim;
 *  - it has a clickable report-id link.
 */
export function matchOutstandingRows(
  rows: OutstandingRow[],
  key: DraftResumeKey,
): DraftMatch[] {
  const siteNeedle = normalizeWhitespace(key.siteName).toLowerCase();
  const periodNeedle = normalizeWhitespace(key.reportingPeriod);
  const typeNeedle = key.eventType.trim();

  const matches: DraftMatch[] = [];
  for (const row of rows) {
    const facility = normalizeWhitespace(row.facilityName).toLowerCase();
    const period = normalizeWhitespace(row.reportingPeriod);
    const type = row.eventType.trim();
    if (
      facility === siteNeedle &&
      period === periodNeedle &&
      type === typeNeedle &&
      row.linkElementId !== ""
    ) {
      matches.push({
        reportId: row.reportId,
        linkElementId: row.linkElementId,
        rowIndex: row.rowIndex,
      });
    }
  }
  return matches;
}

/**
 * Collapse all whitespace runs to a single space, then trim. The outstanding
 * table's Reporting Period cell ships interior whitespace and `<br>` tags
 * around the dash separator, so we normalize before comparing.
 */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
