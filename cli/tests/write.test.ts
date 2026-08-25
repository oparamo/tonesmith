/**
 * What the command does with its arguments, not which edits a device accepts.
 *
 * Dot-paths, value coercion and every rejection are `@tonesmith/core`'s, proven in
 * `core/tests/patch-utils.test.ts` and the gx1 edit validator's suite. What `addWrite` owns is
 * reading `path=value` off the argv, and turning a driver throw into a message and exit 1.
 */
import { describe, it, expect, afterEach } from "vitest";
import { runCli, withTempDir, patchAt } from "./helpers";

describe("gx1 write", () => {
  let temp: ReturnType<typeof withTempDir>;
  afterEach(() => { temp.cleanup(); });

  it("applies every field it was given and writes the file back", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0",
      "amp.params.gain=10", "amp.params.solo=true", "key=G",
    ]);

    const errorOutput = error.join("\n");
    expect(exitCode, errorOutput).toBeUndefined();
    const patch = patchAt(temp.fixture);
    expect(patch.amp.params.gain).toBe(10);
    expect(patch.amp.params.solo).toBe(true);
    expect(patch.key).toBe("G");
  });

  // With no separator there is nothing to split on, and slicing at the index of one drops the
  // argument's last character, so `amp.params.gain` reads as the unknown field `amp.params.gai`.
  it("rejects a field argument with no '=', naming it as typed", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "amp.params.gain"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("amp.params.gain");
  });

  // The command's one error case: a driver throw becomes a printed message and a failing exit
  // code rather than an unhandled rejection. Which paths the driver refuses is core's.
  it("prints a driver rejection and exits 1", async () => {
    temp = withTempDir();

    const { error, exitCode } = await runCli(["gx1", "write", temp.fixture, "0", "nonexistent.foo=1"]);

    expect(exitCode).toBe(1);
    expect(error.join("\n")).toContain("nonexistent");
  });
});
