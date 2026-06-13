// Thin secondary entry point demonstrating the onboarding-once model: a
// SiteProfile JSON (per-WDID CONSTANTS captured once) + a slim inspection CSV
// (per-submission VARIABLES) are composed into the MonitoringRecord[] the
// existing runFill consumes. The app DB is the canonical source of these
// constants; this path is for the CLI / scripted runs.
//
// Usage:
//   orchestrator-profile <site-profile.json> <inspection.csv>
//   (or set SMARTS_SITE_PROFILE / SMARTS_INSPECTION_CSV)
//
// INVARIANT (inherited from runFill): the bot NEVER certifies. A human does.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SMARTSCredentials } from "../auth/types.js";
import { composeMonitoringRecords } from "../compose/compose-monitoring-records.js";
import { parseInspectionCsv } from "../compose/parse-inspection-csv.js";
import { parseSiteProfile } from "../compose/site-profile.schema.js";
import { validateForCgp } from "../validation/cgp-validation.js";
import { EVENT_TYPE_OPTION } from "./event-information.js";
import { runFill } from "./run-fill.js";

async function main(argv: string[]): Promise<number> {
  const username = process.env["SMARTS_USERNAME"];
  const password = process.env["SMARTS_PASSWORD"];
  if (!username || !password) {
    console.error("SMARTS_USERNAME and SMARTS_PASSWORD env vars are required");
    return 2;
  }

  const profileArg = process.env["SMARTS_SITE_PROFILE"] ?? argv[2];
  const csvArg = process.env["SMARTS_INSPECTION_CSV"] ?? argv[3];
  if (!profileArg || !csvArg) {
    console.error(
      "usage: orchestrator-profile <site-profile.json> <inspection.csv>  " +
        "(or set SMARTS_SITE_PROFILE / SMARTS_INSPECTION_CSV)",
    );
    return 2;
  }

  const profilePath = resolve(process.cwd(), profileArg);
  const csvPath = resolve(process.cwd(), csvArg);

  let profileRaw: unknown;
  try {
    profileRaw = JSON.parse(await readFile(profilePath, "utf8"));
  } catch (e) {
    console.error(`could not read site profile ${profilePath}: ${(e as Error).message}`);
    return 1;
  }

  const profileResult = parseSiteProfile(profileRaw);
  if (!profileResult.ok) {
    console.error(`site profile invalid (${profileResult.errors.length} error(s)):`);
    for (const e of profileResult.errors) console.error(`  - ${e}`);
    return 1;
  }
  const profile = profileResult.profile;

  console.log(`orchestrator-profile: parsing inspection CSV ${csvPath}`);
  const inspection = await parseInspectionCsv(csvPath);
  if (!inspection.ok) {
    console.error(`inspection CSV invalid (${inspection.errors.length} error(s)):`);
    for (const e of inspection.errors) console.error(`  - ${e}`);
    return 1;
  }

  const composed = composeMonitoringRecords(
    profile,
    inspection.event,
    inspection.entries,
  );
  if (!composed.ok) {
    console.error(`compose failed (${composed.errors.length} error(s)):`);
    for (const e of composed.errors) console.error(`  - ${e}`);
    return 1;
  }

  const validated = validateForCgp(composed.records);
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
  const eventType = profile.eventType ?? EVENT_TYPE_OPTION;

  console.log(
    `orchestrator-profile: starting runFill wdid=${profile.wdid} ` +
      `records=${validated.records.length} headless=${headless} ` +
      `siteName="${profile.siteName}" eventType="${eventType}"`,
  );
  const result = await runFill(credentials, profile.wdid, validated.records, {
    headless,
    siteName: profile.siteName,
    eventType,
  });

  if (result.status === "filled") {
    console.log("");
    console.log("FILLED — review package ready for human certification.");
    console.log(`  records: ${result.records.length}`);
    for (const p of result.reviewPackage.sampleScreenshots) {
      console.log(`    - ${p}`);
    }
    console.log(`  data summary: ${result.reviewPackage.dataSummaryScreenshot}`);
    console.log(`  certification: ${result.reviewPackage.certificationScreenshot}`);
    console.log("  Reminder: a human must click Certify. The bot does not.");
    return 0;
  }

  console.error("");
  console.error(`HALTED: ${result.reason}`);
  if (result.screenshotPath) console.error(`screenshot: ${result.screenshotPath}`);
  return 1;
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main(process.argv).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error("orchestrator-profile: fatal error");
      console.error(err);
      process.exit(1);
    },
  );
}

export { main as runProfileCli };
