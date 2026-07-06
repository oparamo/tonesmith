import { describe, it, expect } from "vitest";
import { runCli } from "./helpers";

describe("tonesmith program", () => {
  it("exits with an error for an unknown device subcommand", async () => {
    const { exitCode, errorMessage } = await runCli(["nonexistent-device"]);
    expect(exitCode).toBe(1);
    expect(errorMessage).toContain("unknown command");
  });
});
