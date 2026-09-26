/**
 * A pass-through to `patchService.copyPatch`, which owns resolving both refs, replacing the slot
 * and refusing an index past the end, all proven in `core/tests/service/patchService.test.ts`. What
 * is left is that the command wires four operands through in the right order and reports where the
 * patch went.
 */
import { describe, it, expect, onTestFinished } from "vitest";
import { addCopy } from "../../src/command/copy";
import { fakeDriver, blankPatch, withTempDir, writePatchFile, patchAt, runCommand } from "../helpers";

describe("addCopy", () => {
  it("copies the srcRef patch of src into the dstRef slot of dst", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const src = await writePatchFile({ dir: temp.dir, filename: "src.json", patches: [blankPatch("A"), blankPatch("B"), blankPatch("C")] });
    const dst = await writePatchFile({ dir: temp.dir, filename: "dst.json", patches: [blankPatch("X")] });

    const { error, exitCode } = await runCommand(addCopy, driver, ["copy", src, "1", dst, "0"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect((await patchAt(driver, dst)).name).toBe("B");
  });

  it("reports the copied patch name, destination file and slot", async () => {
    const driver = fakeDriver();
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const src = await writePatchFile({ dir: temp.dir, filename: "src.json", patches: [blankPatch("A"), blankPatch("B")] });
    const dst = await writePatchFile({ dir: temp.dir, filename: "dst.json", patches: [blankPatch("X")] });

    const { info } = await runCommand(addCopy, driver, ["copy", src, "1", dst, "0"]);

    const output = info.join("\n");
    expect(output).toContain("B");
    expect(output).toContain(dst);
    expect(output).toContain("0");
  });

  it("a failed copy prints the error and exits 1", async () => {
    const driver = fakeDriver({ parseFile: () => { throw new Error("fake-rejection"); } });
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);
    const src = await writePatchFile({ dir: temp.dir, filename: "src.json", patches: [blankPatch("A")] });
    const dst = await writePatchFile({ dir: temp.dir, filename: "dst.json", patches: [blankPatch("X")] });

    const { error, exitCode } = await runCommand(addCopy, driver, ["copy", src, "0", dst, "0"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("fake-rejection");
  });
});
