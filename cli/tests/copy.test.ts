/**
 * A pass-through to `patchUtils.copyPatch`, which owns resolving both refs, replacing the slot and
 * refusing an index past the end, all proven in `core/tests/patch-utils.test.ts`. What is left is
 * that the command wires four operands through in the right order and reports where the patch went.
 */
import { describe, it, expect, afterEach } from "vitest";
import { runCli, withTempDir, patchAt } from "./helpers";

describe("gx1 copy", () => {
  let src: ReturnType<typeof withTempDir>;
  let dst: ReturnType<typeof withTempDir>;
  afterEach(() => { src.cleanup(); dst.cleanup(); });

  it("copies the named source patch into the named destination slot", async () => {
    src = withTempDir();
    dst = withTempDir();
    const srcName = patchAt(src.fixture, 2).name;
    const displaced = patchAt(dst.fixture).name;
    expect(srcName, "the fixture must differ at these two slots for the copy to show").not.toBe(displaced);

    const { info, error, exitCode } = await runCli(["gx1", "copy", src.fixture, "2", dst.fixture, "0"]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    expect(patchAt(dst.fixture).name).toBe(srcName);
    expect(info.join("\n"), "says which slot it landed in").toContain(dst.fixture);
  });

  it("prints a driver rejection and exits 1", async () => {
    src = withTempDir();
    dst = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "No Such Patch", dst.fixture, "0"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("No Such Patch");
  });
});
