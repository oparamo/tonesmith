import { vi } from "vitest";
import type { Command } from "commander";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gx1, patchService } from "@tonesmith/core";
import { buildProgram } from "../../src/program";

const FIXTURE = join(import.meta.dirname, "../../../fixtures/gx1/rock-tones.tsl");

interface CliResult {
  info: string[];
  error: string[];
  exitCode?: number;
}

/** Commander only inherits `exitOverride`/`configureOutput` onto a subcommand added after the
 * call, and `buildProgram` has already added every device by the time a test gets the program, so
 * set both again on every command in the tree. */
const configureCaptureAll = (command: Command, info: string[], error: string[]): void => {
  command.exitOverride();
  command.configureOutput({
    writeOut: (str) => { info.push(str); },
    writeErr: (str) => { error.push(str); },
  });
  for (const child of command.commands) configureCaptureAll(child, info, error);
};

/** Runs the real CLI program end to end, capturing every line commander or a command prints. */
const runCli = async (argv: string[]): Promise<CliResult> => {
  const program = buildProgram();
  const info: string[] = [];
  const error: string[] = [];
  configureCaptureAll(program, info, error);

  const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    info.push(args.map(String).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    error.push(args.map(String).join(" "));
  });

  let exitCode: number | undefined;
  process.exitCode = undefined;
  try {
    await program.parseAsync(argv, { from: "user" });
    exitCode = process.exitCode;
  } catch (caught) {
    if (caught && typeof caught === "object" && "exitCode" in caught) {
      exitCode = (caught as { exitCode: number }).exitCode;
    } else {
      throw caught;
    }
  } finally {
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  }

  return { info, error, exitCode };
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

/** The patch at `index` of the file at `path`, read back through the real gx1 driver. */
const patchAt = async (path: string, index = 0): Promise<gx1.Patch> => {
  const file = await patchService.readPatchFile(gx1.driver, path);
  const patch = file.patches[index];
  if (patch === undefined) throw new Error(`Expected patch ${index} of ${path}, got nothing`);
  return patch;
};

export { runCli, withTempDir, emptyTempDir, patchAt, FIXTURE };
