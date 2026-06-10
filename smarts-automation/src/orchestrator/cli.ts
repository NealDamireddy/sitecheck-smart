import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMonitoringCsv } from "../csv/parse-monitoring-csv.js";
import { validateForCgp } from "../validation/cgp-validation.js";
import type { SMARTSCredentials } from "../auth/types.js";
import { runFill } from "./run-fill.js";

async function main(argv: string[]): Promise<number> {
  const username = process.env["SMARTS_USERNAME"];
  const password = process.env["SMARTS_PASSWORD"];
  if (!username || !password) {
    console.error(
      "SMARTS_USERNAME and SMARTS_PASSWORD env vars are required",
    );
    return 2;
  }

  const wdid = process.env["SMARTS_WDID"] ?? argv[2];
  const csvArg = process.env["SMARTS_CSV"] ?? argv[3] ?? argv[2];

  if (!wdid || isLikelyCsvPath(wdid)) {
    console.error(
      "usage: orchestrator <wdid> <csv-path>  (or set SMARTS_WDID env)",
    );
    return 2;
  }
  const csvPath = csvArg && csvArg !== wdid ? csvArg : process.env["SMARTS_CSV"];
  if (!csvPath) {
    console.error(
      "csv path is required (positional arg or SMARTS_CSV env var)",
    );
    return 2;
  }

  const resolvedCsv = resolve(process.cwd(), csvPath);
  console.log(`orchestrator: parsing CSV ${resolvedCsv}`);

  const parsed = await parseMonitoringCsv(resolvedCsv);
  if (!parsed.ok) {
    console.error(`CSV parse failed (${parsed.errors.length} error(s))`);
    for (const e of parsed.errors) {
      console.error(`  - row=${e.recordIndex + 1} field=${e.field}: ${e.message}`);
    }
    return 1;
  }

  const validated = validateForCgp(parsed.records);
  if (!validated.ok) {
    console.error(`CGP validation failed (${validated.errors.length} error(s))`);
    for (const e of validated.errors) {
      console.error(`  - row=${e.recordIndex + 1} field=${e.field}: ${e.message}`);
    }
    return 1;
  }

  if (validated.warnings.length > 0) {
    console.log(
      `Note: ${validated.warnings.length} NAL warning(s) — proceeding to fill anyway`,
    );
    for (const w of validated.warnings) {
      console.log(`  ! ${w.message} (record #${w.recordIndex + 1})`);
    }
  }

  const credentials: SMARTSCredentials = { username, password };
  const headlessEnv = process.env["PLAYWRIGHT_HEADED"];
  const headless = headlessEnv !== "1" && headlessEnv !== "true";
  // Optional: when set, runFill checks the "Ad Hoc Reports - Outstanding"
  // table for a draft matching (siteName, reporting period, event type) and
  // resumes it instead of creating a duplicate "Not Submitted" report.
  const siteName = process.env["SMARTS_SITE_NAME"]?.trim() || undefined;
  const eventType = process.env["SMARTS_EVENT_TYPE"]?.trim() || undefined;

  console.log(
    `orchestrator: starting runFill wdid=${wdid} records=${validated.records.length} headless=${headless}` +
      (siteName ? ` siteName="${siteName}"` : " (no siteName — duplicate check disabled)"),
  );
  const result = await runFill(credentials, wdid, validated.records, {
    headless,
    siteName,
    eventType,
  });

  if (result.status === "filled") {
    console.log("");
    console.log("FILLED — review package ready for human certification.");
    console.log(`  records: ${result.records.length}`);
    console.log("  sample screenshots:");
    for (const p of result.reviewPackage.sampleScreenshots) {
      console.log(`    - ${p}`);
    }
    console.log(`  data summary: ${result.reviewPackage.dataSummaryScreenshot}`);
    console.log(
      `  certification: ${result.reviewPackage.certificationScreenshot}`,
    );
    console.log("  Reminder: a human must click Certify. The bot does not.");
    return 0;
  }

  console.error("");
  console.error(`HALTED: ${result.reason}`);
  if (result.screenshotPath) {
    console.error(`screenshot: ${result.screenshotPath}`);
  }
  return 1;
}

function isLikelyCsvPath(s: string): boolean {
  return s.endsWith(".csv") || s.includes("/") || s.includes("\\");
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main(process.argv).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error("orchestrator: fatal error");
      console.error(err);
      process.exit(1);
    },
  );
}
