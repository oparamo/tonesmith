import { describe, it, expect } from "vitest";
import { runCli } from "./helpers";
import packageJson from "../package.json" with { type: "json" };

describe("tonesmith program", () => {
  it("reports the package version", async () => {
    const { exitCode, errorMessage } = await runCli(["--version"]);

    // commander's exitOverride throws for --version too, carrying the printed text as the message.
    expect(exitCode).toBe(0);
    expect(errorMessage).toContain(packageJson.version);
  });


  it("exits with an error for an unknown device subcommand", async () => {
    const { exitCode, errorMessage } = await runCli(["nonexistent-device"]);

    expect(exitCode).toBe(1);
    expect(errorMessage).toContain("unknown command");
  });
});
