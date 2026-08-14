import { describe, it, expect, vi, afterEach } from "vitest";
import { gx1 } from "@tonesmith/core";

/** The opening of every SGR sequence the printer emits: ESC, then "[". */
const ANSI_ESCAPE = "\u001b[";

/**
 * Imports a fresh copy of the printer under the given terminal conditions and returns what it
 * prints. The gate is read once at import, so each case needs its own module instance.
 */
const printedUnder = async (isTTY: boolean): Promise<string> => {
  const original = process.stdout.isTTY;
  process.stdout.isTTY = isTTY;
  vi.resetModules();

  const { printGroups } = await import("../src/common/capabilities-print");
  const lines: string[] = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });

  try {
    printGroups(gx1.driver.capabilities);
  } finally {
    vi.restoreAllMocks();
    process.stdout.isTTY = original;
  }
  return lines.join("\n");
};

describe("capability printing colors", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  // Piped or redirected, the escapes are literal garbage in the destination file rather than color.
  it("prints no escape sequences when stdout is not a terminal", async () => {
    const output = await printedUnder(false);

    expect(output).not.toContain(ANSI_ESCAPE);
  });

  it("colors its output for a terminal", async () => {
    vi.stubEnv("NO_COLOR", undefined);

    const output = await printedUnder(true);

    expect(output).toContain(ANSI_ESCAPE);
  });

  it("honors NO_COLOR even on a terminal", async () => {
    vi.stubEnv("NO_COLOR", "1");

    const output = await printedUnder(true);

    expect(output).not.toContain(ANSI_ESCAPE);
  });
});
