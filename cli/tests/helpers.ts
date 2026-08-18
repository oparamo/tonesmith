import { vi } from "vitest";
import type { Command } from "commander";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gx1 } from "@tonesmith/core";
import { buildProgram } from "../src/program";

const FIXTURE = join(import.meta.dirname, "../../fixtures/gx1/rock-tones.tsl");

interface CliResult {
  info: string[];
  error: string[];
  exitCode?: number;
  errorMessage?: string;
}

/** Commander hands exitOverride down only to subcommands added after the call, and buildProgram
 * has already added every device by the time a test gets the program, so set it on the whole tree. */
const exitOverrideAll = (command: Command): void => {
  command.exitOverride();
  for (const child of command.commands) exitOverrideAll(child);
};

/** Runs the CLI program in-process, capturing console output and reporting the exit code the run
 * settled on, whether the program set it or commander threw its own exit (exitOverride). The
 * process's own code is cleared afterward so one failing case can't fail the test run. */
const runCli = async (argv: string[]): Promise<CliResult> => {
  const program = buildProgram();
  exitOverrideAll(program);

  const info: string[] = [];
  const error: string[] = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    info.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    error.push(args.map(String).join(" "));
  });

  let exitCode: number | undefined;
  let errorMessage: string | undefined;
  try {
    await program.parseAsync(argv, { from: "user" });
    exitCode = process.exitCode as number | undefined;
  } catch (caught) {
    if (caught && typeof caught === "object" && "exitCode" in caught) {
      const commanderError = caught as { exitCode: number; message: string };
      exitCode = commanderError.exitCode;
      errorMessage = commanderError.message;
    } else {
      vi.restoreAllMocks();
      throw caught;
    }
  } finally {
    vi.restoreAllMocks();
    process.exitCode = undefined;
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

/**
 * A value the test has already established is there: the patch a command just wrote, the slot a
 * copy just filled. Failing here says which one was missing, where the alternative is a cascade of
 * assertions against `undefined`.
 */
const present = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Expected ${what}, got nothing`);
  return value;
};

/** The patch at `index` of the file at `path`, read back through the driver. */
const patchAt = (path: string, index = 0): gx1.Patch =>
  present(gx1.driver.readFile(path).patches[index], `patch ${index} of ${path}`);

export { runCli, withTempDir, emptyTempDir, present, patchAt, FIXTURE };
