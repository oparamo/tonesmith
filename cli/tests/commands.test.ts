import { describe, it, expect, vi, afterEach } from "vitest";
import { Command } from "commander";
import type { Patch, PatchDriver, DeviceCapabilities, RawPatch } from "@tonesmith/core";
import { configureDeviceCommands } from "../src/common/commands";

const caps: DeviceCapabilities = {
  chain: { description: "The signal chain model.", defaultOrder: ["amp", "delay"] },
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
  decodePatch: (raw: RawPatch) => raw as unknown as Patch,
  encodePatch: (patch: Patch) => patch as unknown as RawPatch,
  ...overrides,
});

const buildTestCommand = (driver: PatchDriver): Command => {
  const cmd = new Command("stub");
  configureDeviceCommands(cmd, driver, () => { /* no-op print */ });
  cmd.exitOverride();
  return cmd;
};

describe("configureDeviceCommands", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("prints the driver's error message and exits 1 when an action throws", async () => {
    const driver = makeDriver({
      readFile: () => { throw new Error("boom"); },
    });
    const cmd = buildTestCommand(driver);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit(1)"); });

    const runReadCommand = cmd.parseAsync(["read", "file.tsl"], { from: "user" });

    await expect(runReadCommand).rejects.toThrow("exit(1)");
    expect(errorSpy).toHaveBeenCalledWith("boom");
  });
});
