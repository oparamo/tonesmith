import { vi } from "vitest";
import type { Command } from "commander";
import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gx1, patchUtils } from "@tonesmith/core";
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
const withTempDir = async (): Promise<{ dir: string; fixture: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-cli-"));
  const fixture = join(dir, "rock-tones.tsl");
  await copyFile(FIXTURE, fixture);
  return { dir, fixture, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

/** An empty scratch dir, for tests that create new files from scratch. */
const emptyTempDir = async (): Promise<{ dir: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-cli-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
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

/** Whether a path exists. Only a missing file answers no; any other failure is rethrown. */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
};

/** The patch at `index` of the file at `path`, read back through the driver. */
const patchAt = async (path: string, index = 0): Promise<gx1.Patch> => {
  const file = await patchUtils.readPatchFile(gx1.driver, path);
  return present(file.patches[index], `patch ${index} of ${path}`);
};

export { runCli, withTempDir, emptyTempDir, present, pathExists, patchAt, FIXTURE };
