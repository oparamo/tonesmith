/**
 * What the command does with its arguments, not which edits a device accepts. Dot-paths, value
 * coercion and every rejection belong to core and the driver, whose contract a fake here stands in
 * for; the edit rules are proven in `core/tests/service/specService.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import type { FieldEdit } from "@tonesmith/core";
import { addWrite } from "../../src/command/write";
import { fakeDriver, blankPatch, tempDir, writePatchFile, patchAt, runCommand } from "../helpers";

describe("addWrite", () => {
  it("passes every path=value argument to the driver and saves the result", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    const { error, exitCode } = await runCommand(addWrite, driver, [
      "write", file, "0", "alpha.params.level=5", "beta.params.tone=7",
    ]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const patch = await patchAt(driver, file);
    expect(patch.alpha.params.level).toBe("5");
    expect(patch.beta.params.tone).toBe("7");
  });

  // The report comes from what the driver wrote, so a value it normalized reads back normalized.
  it("reports each value as written rather than as typed", async () => {
    const driver = fakeDriver({ applyEdits: () => ({ "alpha.params.level": 45 }) });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    const { info, error, exitCode } = await runCommand(addWrite, driver, ["write", file, "0", "alpha.params.level=045"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("alpha.params.level=45");
    expect(info.join("\n")).not.toContain("045");
  });

  // Splitting at the first "=" leaves nothing before it (no separator at all, or one that leads).
  it.each(["amp.params.gain", "=5"])("rejects %o, naming it as typed", async (argument) => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    const { error, exitCode } = await runCommand(addWrite, driver, ["write", file, "0", argument]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain(argument);
  });

  it("a value containing '=' reaches the driver intact past the first split", async () => {
    let received: FieldEdit[] = [];
    const driver = fakeDriver({ applyEdits: (_, edits) => { received = [...edits]; return {}; } });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    await runCommand(addWrite, driver, ["write", file, "0", "a=b=c"]);

    expect(received).toStrictEqual([["a", "b=c"]]);
  });

  it("an empty value reaches the driver as an empty string", async () => {
    let received: FieldEdit[] = [];
    const driver = fakeDriver({ applyEdits: (_, edits) => { received = [...edits]; return {}; } });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    await runCommand(addWrite, driver, ["write", file, "0", "a="]);

    expect(received).toStrictEqual([["a", ""]]);
  });

  // Parsing every argument happens before the locked edit, so one bad argument anywhere in the
  // list means none of them reach the file.
  it("a malformed argument anywhere in the list leaves the file unchanged", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });
    const before = await readFile(file, "utf8");

    const { exitCode } = await runCommand(addWrite, driver, [
      "write", file, "0", "alpha.params.level=5", "bad-argument",
    ]);

    expect(exitCode).toBe(1);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("the report names the patch index the edit landed on", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A"), blankPatch("B")] });

    const { info } = await runCommand(addWrite, driver, ["write", file, "1", "beta.params.x=1"]);

    expect(info.join("\n")).toContain("patch 1");
  });

  it("reports several applied fields in order, comma-separated", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });

    const { info } = await runCommand(addWrite, driver, [
      "write", file, "0", "alpha.params.level=5", "beta.params.tone=7",
    ]);

    expect(info.join("\n")).toContain("alpha.params.level=5, beta.params.tone=7");
  });

  // The command's one error case: a throw becomes a printed message and a failing exit code rather
  // than an unhandled rejection. Which paths the driver refuses is core's.
  it("a failed write prints the error and exits 1, leaving the file unchanged", async () => {
    const driver = fakeDriver({ applyEdits: () => { throw new Error("fake-rejection"); } });
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });
    const before = await readFile(file, "utf8");

    const { error, exitCode } = await runCommand(addWrite, driver, ["write", file, "0", "alpha.params.level=5"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("fake-rejection");
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("no field arguments exits 1 and leaves the file unchanged", async () => {
    const driver = fakeDriver();
    const dir = await tempDir();
    const file = await writePatchFile({ dir: dir, filename: "patch.json", patches: [blankPatch("A")] });
    const before = await readFile(file, "utf8");

    const { exitCode } = await runCommand(addWrite, driver, ["write", file, "0"]);

    expect(exitCode).toBe(1);
    expect(await readFile(file, "utf8")).toBe(before);
  });
});
