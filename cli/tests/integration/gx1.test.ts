/**
 * One smoke test per command, run through the real CLI program against a real gx1 fixture. Every
 * behavior worth asserting on its own terms lives in `tests/command/` against a fake driver; this
 * suite only proves the CLI, core and the gx1 driver still fit together.
 */
import { describe, it, expect, onTestFinished } from "vitest";
import { join } from "node:path";
import { gx1, patchService } from "@tonesmith/core";
import { runCli, withTempDir, emptyTempDir, patchAt, FIXTURE } from "./helpers";

describe("gx1 end to end", () => {
  it("read prints every patch in the fixture", async () => {
    const expected = await patchService.readPatchFile(gx1.driver, FIXTURE);

    const { info, error, exitCode } = await runCli(["gx1", "read", FIXTURE]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    for (const patch of expected.patches) expect(output).toContain(patch.name);
  });

  it("write updates a field and saves it back", async () => {
    const temp = await withTempDir();
    onTestFinished(temp.cleanup);

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.params.gain=10"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const patch = await patchAt(temp.fixture);
    expect(patch.amp.params.gain).toBe(10);
  });

  it("copy moves a patch from one file into a slot of another", async () => {
    const src = await withTempDir();
    onTestFinished(src.cleanup);
    const dst = await withTempDir();
    onTestFinished(dst.cleanup);
    const moved = (await patchAt(src.fixture, 2)).name;

    const { error, exitCode } = await runCli(["gx1", "copy", src.fixture, "2", dst.fixture, "0"]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    expect((await patchAt(dst.fixture)).name).toBe(moved);
  });

  it("new creates a blank patch file named after the file", async () => {
    const temp = await emptyTempDir();
    onTestFinished(temp.cleanup);
    const file = join(temp.dir, "my-tones.tsl");

    const { error, exitCode } = await runCli(["gx1", "new", file]);

    expect(exitCode, error.join("\n")).toBeUndefined();
    const created = await patchService.readPatchFile(gx1.driver, file);
    expect(created.patches).toHaveLength(1);
    expect(created.name).toBe("my-tones");
  });

  it.each([
    [[]],
    [["chain"]],
    [["amp"]],
    [["amp", "JC-120"]],
  ])("capabilities %o exits cleanly", async (args) => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", ...args]);

    expect(exitCode, error.join("\n")).toBeUndefined();
  });
});
