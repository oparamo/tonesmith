import { describe, it, expect, vi, afterEach } from "vitest";

/** The opening of every SGR sequence `color.ts` emits: ESC, then "[". */
const ANSI_ESCAPE = "\u001b[";

interface ColorCodes {
  RESET: string;
  BOLD: string;
  DIM: string;
  CYAN: string;
  YELLOW: string;
  GREEN: string;
}

/**
 * Imports a fresh copy of `color.ts` under the given terminal conditions. The gate is read once at
 * import, so each case needs its own module instance.
 */
const colorUnder = async (isTTY: boolean, noColor: string | undefined): Promise<ColorCodes> => {
  const original = process.stdout.isTTY;
  process.stdout.isTTY = isTTY;
  vi.stubEnv("NO_COLOR", noColor);
  vi.resetModules();

  try {
    return await import("../../src/common/color");
  } finally {
    process.stdout.isTTY = original;
  }
};

describe("color", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each([
    [false, undefined, false],
    [true, undefined, true],
    [true, "1", false],
    // Empty is unset by the no-color.org convention, so a terminal still colors.
    [true, "", true],
  ])("isTTY=%s NO_COLOR=%o colors output: %s", async (isTTY, noColor, colored) => {
    const { RESET } = await colorUnder(isTTY, noColor);

    expect(RESET.startsWith(ANSI_ESCAPE)).toBe(colored);
  });

  it("empties every exported code together when color is off", async () => {
    const codes = await colorUnder(false, undefined);

    expect(Object.values(codes).every(code => code === "")).toBe(true);
  });
});
