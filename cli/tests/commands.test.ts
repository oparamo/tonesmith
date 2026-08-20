import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import type { Patch, PatchDriver, DeviceCapabilities, RawPatch } from "@tonesmith/core";
import { configureDeviceCommands } from "../src/common/commands";

const caps: DeviceCapabilities = {
  chain: { description: "The signal chain model.", defaultOrder: ["amp", "delay"], blocks: {} },
  patchName: { maxLength: 16 },
  groups: [],
};

const makeDriver = (overrides: Partial<PatchDriver> = {}): PatchDriver => ({
  id: "stub",
  name: "Stub Device",
  capabilities: caps,
  readFile: () => ({ name: "Set", device: "STUB", patches: [] }),
  writeFile: () => { /* no-op */ },
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
    const driver = makeDriver({
      readFile: () => { throw new Error("boom"); },
    });
    const cmd = buildTestCommand(driver);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Calling process.exit tears the process down with output still queued, so a failure piped
    // into another command can arrive truncated. Setting the code lets the runtime drain first.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit called"); });

    await cmd.parseAsync(["read", "file.tsl"], { from: "user" });

    expect(errorSpy).toHaveBeenCalledWith("boom");
    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
