import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import type {
  SMARTSCredentials,
  SMARTSSession,
  CreateSessionResult,
} from "./types.js";

export const SMARTS_LOGIN_URL =
  "https://smarts.waterboards.ca.gov/smarts/faces/SwSmartsLogin.xhtml";

export const SMARTS_BANNER_TEXT =
  "Stormwater Multiple Application and Report Tracking System";

const USERNAME_SELECTOR = '[id="loginForm:userId"]';
const PASSWORD_SELECTOR = '[id="loginForm:password"]';
const LOGIN_BUTTON_SELECTOR = '[id="loginForm:loginButton"]';

const NAV_TIMEOUT_MS = 30_000;
const BANNER_TIMEOUT_MS = 30_000;

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_ROOT = resolve(HERE, "..", "..");
const DEFAULT_SCREENSHOT_PATH = resolve(
  MODULE_ROOT,
  "artifacts",
  "session-result.png",
);

export function isHeadedEnv(): boolean {
  const v = process.env["PLAYWRIGHT_HEADED"];
  return v === "1" || v === "true";
}

export interface CreateSessionOptions {
  headless?: boolean;
  screenshotPath?: string;
  navigationTimeoutMs?: number;
  bannerTimeoutMs?: number;
}

export async function createSession(
  credentials: SMARTSCredentials,
  options: CreateSessionOptions = {},
): Promise<CreateSessionResult> {
  if (!credentials.username || !credentials.password) {
    return halted("Authentication failed — credentials are empty", null, null);
  }

  const screenshotPath = options.screenshotPath ?? DEFAULT_SCREENSHOT_PATH;
  await mkdir(dirname(screenshotPath), { recursive: true });

  // Explicit option wins; otherwise PLAYWRIGHT_HEADED=1 launches a visible
  // browser so a human can watch the run live. Defaults to headless.
  const headless = options.headless ?? !isHeadedEnv();
  const navTimeout = options.navigationTimeoutMs ?? NAV_TIMEOUT_MS;
  const bannerTimeout = options.bannerTimeoutMs ?? BANNER_TIMEOUT_MS;

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({ headless });
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultTimeout(navTimeout);
    page.setDefaultNavigationTimeout(navTimeout);

    await page.goto(SMARTS_LOGIN_URL, { waitUntil: "domcontentloaded" });

    await page.locator(USERNAME_SELECTOR).fill(credentials.username);
    await page.locator(PASSWORD_SELECTOR).fill(credentials.password);

    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      page.locator(LOGIN_BUTTON_SELECTOR).click(),
    ]);

    const banner = page.getByText(SMARTS_BANNER_TEXT, { exact: false }).first();
    try {
      await banner.waitFor({ state: "visible", timeout: bannerTimeout });
    } catch {
      await safeScreenshot(page, screenshotPath);
      await teardown(browser, context, page);
      return halted(
        "Authentication failed — check credentials",
        screenshotPath,
        null,
      );
    }

    await safeScreenshot(page, screenshotPath);

    const session: SMARTSSession = {
      page,
      context,
      browser,
      close: async () => {
        await teardown(browser, context, page);
      },
    };

    return { status: "authenticated", session, screenshotPath };
  } catch (err) {
    if (page) await safeScreenshot(page, screenshotPath);
    await teardown(browser, context, page);
    const reason =
      err instanceof Error
        ? `Authentication failed — ${err.message}`
        : "Authentication failed — unknown error";
    return halted(reason, screenshotPath, null);
  }
}

function halted(
  reason: string,
  screenshotPath: string | null,
  domSnapshotPath: string | null,
): CreateSessionResult {
  return {
    status: "halted",
    reason,
    record: null,
    screenshotPath,
    domSnapshotPath,
    haltedAt: new Date(),
  };
}

async function safeScreenshot(page: Page, path: string): Promise<void> {
  try {
    await page.screenshot({ path, fullPage: false });
  } catch {
    // best-effort screenshot; never throw from cleanup
  }
}

async function teardown(
  browser: Browser | null,
  context: BrowserContext | null,
  page: Page | null,
): Promise<void> {
  try {
    if (page && !page.isClosed()) await page.close();
  } catch {
    /* noop */
  }
  try {
    if (context) await context.close();
  } catch {
    /* noop */
  }
  try {
    if (browser) await browser.close();
  } catch {
    /* noop */
  }
}

async function loadCredentials(): Promise<SMARTSCredentials> {
  const envUser = process.env["SMARTS_USERNAME"];
  const envPass = process.env["SMARTS_PASSWORD"];
  if (envUser && envPass) {
    return { username: envUser, password: envPass };
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "SMARTS_USERNAME and SMARTS_PASSWORD env vars must be set when stdin is not a TTY",
    );
  }

  const username = envUser ?? (await prompt("SMARTS username: ", false));
  const password = envPass ?? (await prompt("SMARTS password: ", true));
  return { username, password };
}

async function prompt(question: string, hidden: boolean): Promise<string> {
  if (!hidden) {
    return new Promise((resolveAnswer) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(question, (answer) => {
        rl.close();
        resolveAnswer(answer.trim());
      });
    });
  }

  process.stdout.write(question);
  return new Promise((resolveAnswer, rejectAnswer) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\n" || ch === "\r" || ch === "\u0004") {
          process.stdout.write("\n");
          stdin.removeListener("data", onData);
          stdin.pause();
          if (typeof stdin.setRawMode === "function") stdin.setRawMode(wasRaw);
          resolveAnswer(buffer);
          return;
        }
        if (ch === "\u0003") {
          stdin.removeListener("data", onData);
          stdin.pause();
          if (typeof stdin.setRawMode === "function") stdin.setRawMode(wasRaw);
          rejectAnswer(new Error("input cancelled"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += ch;
      }
    };
    if (typeof stdin.setRawMode === "function") stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

async function main(): Promise<number> {
  let credentials: SMARTSCredentials;
  try {
    credentials = await loadCredentials();
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }

  const headless = !isHeadedEnv();

  console.log(`smarts-automation: opening ${SMARTS_LOGIN_URL} (headless=${headless})`);
  const result = await createSession(credentials, { headless });

  if (result.status === "authenticated") {
    console.log("Authenticated. Banner confirmed.");
    console.log(`Screenshot saved to ${result.screenshotPath}`);
    await result.session.close();
    return 0;
  }

  console.error(`Halted: ${result.reason}`);
  if (result.screenshotPath) {
    console.error(`Screenshot saved to ${result.screenshotPath}`);
  }
  return 1;
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error("smarts-automation: fatal error");
      console.error(err);
      process.exit(1);
    },
  );
}

export type { SMARTSCredentials, SMARTSSession, CreateSessionResult } from "./types.js";
