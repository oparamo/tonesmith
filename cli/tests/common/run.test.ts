import { describe, it, expect, vi, afterEach } from "vitest";
import { run } from "../../src/common/run";

describe("run", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("leaves the exit code unset and prints nothing on stderr when the action succeeds", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run(() => undefined);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("prints a thrown error's message on stderr", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run(() => { throw new Error("boom"); });

    expect(errorSpy).toHaveBeenCalledWith("boom");
  });

  // Calling process.exit tears the process down with output still queued, so setting the code
  // instead lets the runtime drain it first.
  it("sets exit code 1 without calling process.exit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => { throw new Error("exit called"); });

    await run(() => { throw new Error("boom"); });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("handles a rejected async action the same as a sync throw", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await run(() => Promise.reject(new Error("async boom")));

    expect(errorSpy).toHaveBeenCalledWith("async boom");
    expect(process.exitCode).toBe(1);
  });
});
