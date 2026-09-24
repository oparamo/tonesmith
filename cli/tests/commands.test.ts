import { describe, it, expect, vi, afterEach, onTestFinished } from "vitest";
import { Command } from "commander";
import type { Patch, PatchDriver, DeviceCapabilities, RawPatch } from "@tonesmith/core";
import { configureDeviceCommands } from "../src/common/commands";
import { withTempDir } from "./helpers";

const caps: DeviceCapabilities = {
  chain: { description: "The signal chain model.", defaultOrder: ["amp", "delay"], blocks: {} },
  patchName: { maxLength: 16 },
  patchSettings: [],
  groups: [],
};

const makeDriver = (overrides: Partial<PatchDriver> = {}): PatchDriver => ({
  id: "stub",
  name: "Stub Device",
  capabilities: caps,
  parseFile: () => ({ name: "Set", device: "STUB", patches: [] }),
  serializeFile: () => new Uint8Array(),
  newFile: (setName: string) => ({ name: setName, device: "STUB", patches: [] }),
  blankPatch: (name = "NEW") => ({ name }),
  buildPatch: (spec: unknown) => ({ name: (spec as { name: string }).name }),
  applyEdits: (_, edits) => Object.fromEntries(edits),
  viewPatch: (patch: Patch) => ({ name: patch.name, details: [], blocks: [] }),
  decodePatch: (raw: RawPatch) => raw as unknown as Patch,
  encodePatch: (patch: Patch) => patch as unknown as RawPatch,
  ...overrides,
});

const buildTestCommand = (driver: PatchDriver): Command => {
  const cmd = new Command("stub");
  configureDeviceCommands(cmd, driver);
  cmd.exitOverride();
  return cmd;
};

describe("configureDeviceCommands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints the driver's error message and fails the exit code when an action throws", async () => {
    // Core reads the file from disk before the driver sees it, so it has to exist for the
    // driver's own throw to be the one that reaches the command.
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const driver = makeDriver({
      parseFile: () => { throw new Error("boom"); },
    });
    const cmd = buildTestCommand(driver);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Calling process.exit tears the process down with output still queued, so a failure piped
    // into another command can arrive truncated. Setting the code lets the runtime drain first.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit called"); });

    await cmd.parseAsync(["read", temp.fixture], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith("boom");
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
