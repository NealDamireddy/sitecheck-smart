import { describe, it, expect } from "vitest";
import {
  createSession,
  SMARTS_LOGIN_URL,
  SMARTS_BANNER_TEXT,
} from "../src/auth/create-session.js";

describe("createSession (no browser cases)", () => {
  it("exposes the login URL as a constant", () => {
    expect(SMARTS_LOGIN_URL).toBe(
      "https://smarts.waterboards.ca.gov/smarts/faces/SwSmartsLogin.xhtml",
    );
  });

  it("exposes the post-login banner text", () => {
    expect(SMARTS_BANNER_TEXT).toBe(
      "Stormwater Multiple Application and Report Tracking System",
    );
  });

  it("halts immediately with empty username (no browser launched)", async () => {
    const result = await createSession({ username: "", password: "x" });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/credentials are empty/i);
    expect(result.record).toBeNull();
  });

  it("halts immediately with empty password (no browser launched)", async () => {
    const result = await createSession({ username: "u", password: "" });
    expect(result.status).toBe("halted");
    if (result.status !== "halted") return;
    expect(result.reason).toMatch(/credentials are empty/i);
  });
});
