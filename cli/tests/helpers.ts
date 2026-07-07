import { vi } from "vitest";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProgram } from "../src/program";

const FIXTURE = join(import.meta.dirname, "../../core/tests/fixtures/gx1/rock-tones.tsl");

interface CliResult {
  info: string[];
  error: string[];
  exitCode?: number;
  errorMessage?: string;
}

/** Runs the CLI program in-process, capturing console output and normalizing both
 * commander's own exits (exitOverride) and our run() helper's process.exit(1) path
 * into a single { exitCode, errorMessage } shape. */
const runCli = async (argv: string[]): Promise<CliResult> => {
  const program = buildProgram();
  program.exitOverride();

  const info: string[] = [];
  const error: string[] = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    info.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    error.push(args.map(String).join(" "));
  });
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);

  let exitCode: number | undefined;
  let errorMessage: string | undefined;
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    const exitMatch = err instanceof Error ? /^process\.exit\((\d+)\)$/.exec(err.message) : null;
    if (exitMatch) {
      exitCode = Number(exitMatch[1]);
    } else if (err && typeof err === "object" && "exitCode" in err) {
      const commanderError = err as { exitCode: number; message: string };
      exitCode = commanderError.exitCode;
      errorMessage = commanderError.message;
    } else {
      vi.restoreAllMocks();
      throw err;
    }
  } finally {
    vi.restoreAllMocks();
  }

  return { info, error, exitCode, errorMessage };
};

/** A scratch dir with the rock-tones fixture copied in, for tests that write files. */
const withTempDir = (): { dir: string; fixture: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), "tonesmith-cli-"));
  const fixture = join(dir, "rock-tones.tsl");
  copyFileSync(FIXTURE, fixture);
  return { dir, fixture, cleanup: () => { rmSync(dir, { recursive: true, force: true }); } };
};

/** An empty scratch dir, for tests that create new files from scratch. */
const emptyTempDir = (): { dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), "tonesmith-cli-"));
  return { dir, cleanup: () => { rmSync(dir, { recursive: true, force: true }); } };
};

export { runCli, withTempDir, emptyTempDir, FIXTURE };
