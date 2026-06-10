import type { Browser, BrowserContext, Page } from "playwright";
import type { HaltedResult } from "../types/run-result.js";

export interface SMARTSCredentials {
  username: string;
  password: string;
}

export interface SMARTSSession {
  page: Page;
  context: BrowserContext;
  browser: Browser;
  close: () => Promise<void>;
}

export type CreateSessionResult =
  | { status: "authenticated"; session: SMARTSSession; screenshotPath: string }
  | HaltedResult;
