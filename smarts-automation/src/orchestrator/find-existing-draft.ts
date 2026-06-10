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
  // The site Facility name as displayed in the "Facility/Site Name & Address"
  // cell (e.g. "Equus Ct"). Matched as a case-insensitive substring against the
  // cell text — SMARTS shows the name + address joined by line breaks, so a
  // substring match is the resilient choice.
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
  const siteNeedle = key.siteName.trim().toLowerCase();
  const periodNeedle = normalizeWhitespace(key.reportingPeriod);
  const typeNeedle = key.eventType.trim();

  let rows: Array<{
    rowIndex: number;
    facility: string;
    reportingPeriod: string;
    eventType: string;
    reportId: string;
    linkElementId: string;
  }> = [];

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
        return {
          rowIndex: Number(tr.getAttribute("data-ri") ?? "-1"),
          facility: tds[3] ? (tds[3].textContent || "").trim() : "",
          reportingPeriod: tds[6] ? (tds[6].textContent || "").trim() : "",
          eventType: tds[7] ? (tds[7].textContent || "").trim() : "",
          reportId: link ? (link.textContent || "").trim() : "",
          linkElementId: link ? link.id || "" : "",
        };
      });
    })) as typeof rows;
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

  const matches: DraftMatch[] = [];
  for (const row of rows) {
    const facility = row.facility.toLowerCase();
    const period = normalizeWhitespace(row.reportingPeriod);
    const type = row.eventType.trim();
    if (
      facility.includes(siteNeedle) &&
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

  console.log(
    `${TAG} scanned ${rows.length} outstanding draft(s); ${matches.length} match(es) for ` +
      `site="${key.siteName}" period="${key.reportingPeriod}" type="${key.eventType}"` +
      (matches.length > 0
        ? ` -> [${matches.map((m) => m.reportId).join(", ")}]`
        : ""),
  );
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
