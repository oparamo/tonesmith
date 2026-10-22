import { describe, it, expect } from "vitest";
import { addCapabilities } from "../../src/command/capabilities";
import { fakeDriver, runCommand } from "../helpers";

describe("addCapabilities", () => {
  it("with no argument prints the group listing", async () => {
    const driver = fakeDriver();

    const { info, error, exitCode } = await runCommand(addCapabilities, driver, ["capabilities"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("alpha");
    expect(output).toContain("beta");
  });

  it("`chain` prints the chain view", async () => {
    const driver = fakeDriver();

    const { info, error, exitCode } = await runCommand(addCapabilities, driver, ["capabilities", "chain"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain(String(driver.capabilities.patchName.maxLength));
  });

  it("a group id prints that group", async () => {
    const driver = fakeDriver();

    const { info, error, exitCode } = await runCommand(addCapabilities, driver, ["capabilities", "beta"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("TYPE-A");
  });

  it("a group and type id print that type", async () => {
    const driver = fakeDriver();

    const { info, error, exitCode } = await runCommand(addCapabilities, driver, ["capabilities", "beta", "TYPE-A"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("A type.");
  });

  // The chain has nothing to resolve under it, and every other group rejects an unknown type the
  // same way: through core's own lookup, proven in core/tests/service/capabilityService.test.ts.
  it("a lookup failure prints the error and exits 1", async () => {
    const driver = fakeDriver();

    const { error, exitCode } = await runCommand(addCapabilities, driver, ["capabilities", "nonexistent-group"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("nonexistent-group");
  });
});
