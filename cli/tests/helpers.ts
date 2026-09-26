import { onTestFinished, vi } from "vitest";
import { Command } from "commander";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { patchService } from "@tonesmith/core";
import type {
  DeviceCapabilities, FieldEdit, FieldEdits, FieldValue, Patch, PatchDriver, PatchFile,
} from "@tonesmith/core";

/** A block shape generic enough for a dot-path write to reach into, with no device knowledge behind it. */
interface FakeBlock {
  on?: boolean;
  type?: string;
  subType?: string | null;
  params: Record<string, FieldValue>;
}

/** Two independently named blocks, so a swapped operand or a swapped dot-path is the only way to pass by accident. */
interface FakePatch extends Patch {
  alpha: FakeBlock;
  beta: FakeBlock;
}

const blankBlock = (): FakeBlock => ({ params: {} });

const blankPatch = (name: string): FakePatch => ({ name, alpha: blankBlock(), beta: blankBlock() });

const FAKE_CAPABILITIES: DeviceCapabilities = {
  chain: {
    description: "Two blocks, alpha then beta.",
    defaultOrder: ["alpha", "beta"],
    blocks: {
      alpha: { label: "Alpha", group: "alpha", bypass: true },
      beta: { label: "Beta", group: "beta", bypass: false },
    },
  },
  patchName: { maxLength: 16 },
  patchSettings: [],
  groups: [
    { id: "alpha", name: "Alpha", description: "The first block.", types: [] },
    {
      id: "beta",
      name: "Beta",
      description: "The second block.",
      types: [{ id: "TYPE-A", name: "Type A", description: "A type." }],
    },
  ],
};

/** Walks `path` onto `patch`, writing `value` at the end; throws naming the path when a segment is missing. */
const writeByPath = (patch: FakePatch, path: string, value: FieldValue): void => {
  const segments = path.split(".");
  const last = segments.pop();
  let target: Record<string, unknown> = patch as unknown as Record<string, unknown>;
  for (const segment of segments) {
    const next = target[segment];
    if (typeof next !== "object" || next === null) throw new Error(`Unknown field "${path}"`);
    target = next as Record<string, unknown>;
  }
  if (last === undefined) throw new Error(`Unknown field "${path}"`);
  target[last] = value;
};

/** The default `applyEdits`: writes each edit onto the patch in order and reports what it wrote. */
const applyByPath = (patch: FakePatch, edits: readonly FieldEdit[]): FieldEdits => {
  const applied: FieldEdits = {};
  for (const [path, value] of edits) {
    writeByPath(patch, path, value);
    applied[path] = value;
  }
  return applied;
};

/** A JSON-codec driver: distinct block names catch an operand swap, and every method is overridable per test. */
const fakeDriver = (overrides: Partial<PatchDriver<FakePatch>> = {}): PatchDriver<FakePatch> => ({
  id: "fake",
  name: "Fake Device",
  capabilities: FAKE_CAPABILITIES,
  parseFile: (bytes) => JSON.parse(Buffer.from(bytes).toString("utf8")) as PatchFile<FakePatch>,
  serializeFile: (file) => new TextEncoder().encode(JSON.stringify(file)),
  newFile: (setName, nPatches = 1) => ({
    name: setName,
    device: "fake",
    patches: Array.from({ length: nPatches }, (_, index) => blankPatch(`Patch ${index + 1}`)),
  }),
  buildPatch: (spec) => ({ ...blankPatch((spec as { name: string }).name), ...(spec as object) }),
  applyEdits: applyByPath,
  viewPatch: (patch) => ({ name: patch.name, details: [], blocks: [] }),
  ...overrides,
});

interface RunResult {
  info: string[];
  error: string[];
  exitCode?: number;
}

type AddCommand<T extends Patch> = (cmd: Command, driver: PatchDriver<T>) => void;

/** Routes commander's own usage output into `info`/`error` instead of the real terminal. */
const configureCapture = (command: Command, info: string[], error: string[]): void => {
  command.exitOverride();
  command.configureOutput({
    writeOut: (str) => { info.push(str); },
    writeErr: (str) => { error.push(str); },
  });
};

/**
 * Runs one `addX` module against commander for real: builds a bare command, mounts it, and
 * captures both commander's own output and whatever the action prints via `console`. Commander
 * only inherits `exitOverride`/`configureOutput` onto a subcommand created before the call, so
 * both are set again on each of `add`'s own subcommands.
 */
const runCommand = async <T extends Patch>(
  add: AddCommand<T>,
  driver: PatchDriver<T>,
  argv: string[],
): Promise<RunResult> => {
  const cmd = new Command("fake");
  add(cmd, driver);

  const info: string[] = [];
  const error: string[] = [];
  configureCapture(cmd, info, error);
  for (const sub of cmd.commands) configureCapture(sub, info, error);

  const infoSpy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    info.push(args.map(String).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    error.push(args.map(String).join(" "));
  });

  let exitCode: number | undefined;
  process.exitCode = undefined;
  try {
    await cmd.parseAsync(argv, { from: "user" });
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

/** A scratch directory of the calling test's own, removed when that test finishes. */
const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-cli-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  return dir;
};

/** What `writePatchFile` needs beyond a bare list of patches. */
interface PatchFileSeed {
  dir: string;
  filename: string;
  patches: FakePatch[];
  setName?: string;
}

/** Seeds `dir/filename` directly with a fake patch file, bypassing any command under test. */
const writePatchFile = async (seed: PatchFileSeed): Promise<string> => {
  const path = join(seed.dir, seed.filename);
  const file: PatchFile<FakePatch> = { name: seed.setName ?? "Set", device: "fake", patches: seed.patches };
  await writeFile(path, JSON.stringify(file));
  return path;
};

/** The patch at `index` of the file at `path`, read back through `driver`, proving a command's on-disk effect. */
const patchAt = async (driver: PatchDriver<FakePatch>, path: string, index = 0): Promise<FakePatch> => {
  const file = await patchService.readPatchFile(driver, path);
  const patch = file.patches[index];
  if (patch === undefined) throw new Error(`Expected patch ${index} of ${path}, got nothing`);
  return patch;
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

export {
  fakeDriver, blankPatch, FAKE_CAPABILITIES, runCommand, tempDir, writePatchFile, patchAt, pathExists,
};
export type { FakePatch, FakeBlock };
