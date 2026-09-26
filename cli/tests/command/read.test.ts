import { describe, it, expect } from "vitest";
import { addRead } from "../../src/command/read";
import { fakeDriver, blankPatch, tempDir, writePatchFile, runCommand } from "../helpers";

describe("addRead", () => {
  it("prints every patch when ref is omitted", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("First"), blankPatch("Second")] });

    const { info, error, exitCode } = await runCommand(addRead, driver, ["read", file]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("First");
    expect(output).toContain("Second");
  });

  // The driver's own name, not the file's `device` id, is what a person reads.
  it("prints the file/set/device header", async () => {
    const driver = fakeDriver({ name: "Fake Device" });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("A")], setName: "My Set" });

    const { info, error, exitCode } = await runCommand(addRead, driver, ["read", file]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain(file);
    expect(output).toContain("Set: My Set");
    expect(output).toContain("Device: Fake Device");
  });

  it("prints a single patch when given a numeric index", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("First"), blankPatch("Second")] });

    const { info, error, exitCode } = await runCommand(addRead, driver, ["read", file, "0"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("First");
    expect(output).not.toContain("Second");
  });

  it("a name ref selects that patch", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("Alpha"), blankPatch("Beta")] });

    const { info, error, exitCode } = await runCommand(addRead, driver, ["read", file, "Beta"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Beta");
    expect(output).not.toContain("Alpha");
  });

  // `read` passes the resolved index to `printPatch`, so a later patch must carry its own index.
  it("each printed patch carries its own index", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("First"), blankPatch("Second")] });

    const { info, error, exitCode } = await runCommand(addRead, driver, ["read", file, "1"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("[1] Second");
    expect(output).not.toContain("[0]");
  });

  // The command's one error case: a throw becomes a printed message and a failing exit code.
  // Which refs and files are refused is core's, and is proven there.
  it("prints a driver rejection and exits 1", async () => {
    const driver = fakeDriver({ parseFile: () => { throw new Error("fake-rejection"); } });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patches.json", patches: [blankPatch("A")] });

    const { error, exitCode } = await runCommand(addRead, driver, ["read", file]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("fake-rejection");
  });
});
