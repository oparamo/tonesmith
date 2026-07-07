import { describe, it, expect } from "vitest";
import { runCli } from "./helpers";

describe("gx1 capabilities", () => {
  it("lists all groups when given no arguments", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Capability groups");
    expect(output).toContain("amp");
    expect(output).toContain("fx");
  });

  it("lists all items in a single group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "amp"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("JC-120");
  });

  it("prints full detail for a single item", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "amp", "jc-120"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("[amp / JC-120]");
  });

  it("lists an item's subtypes when browsing a group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    expect(info.join("\n")).toContain("Subtypes:");
  });

  it("prints full detail for an item with subtypes and modeled hardware", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "fx", "compressor"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Subtypes:");
    expect(output).toContain("[models: MXR Dyna Comp]");
    expect(output).toContain("Parameters:");
  });

  it("omits the Parameters section for an item with no params of its own or from its group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "cab", "original"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("[cab / ORIGINAL]");
    expect(output).not.toContain("Parameters:");
  });

  it("prints block controls and a 'no selectable types' message for a params-only group", async () => {
    const { info, error, exitCode } = await runCli(["gx1", "capabilities", "ns"]);
    expect(exitCode, error.join("\n")).toBeUndefined();
    const output = info.join("\n");
    expect(output).toContain("Block controls:");
    expect(output).toContain("no selectable types for this block");
  });

  it("exits with an error listing available groups for an unknown group", async () => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", "nonexistent"]);
    expect(exitCode).toBe(1);
    const message = error.join("\n");
    expect(message).toContain('Unknown group "nonexistent"');
    expect(message).toContain("amp");
  });

  it("exits with an error listing available items for an unknown item", async () => {
    const { error, exitCode } = await runCli(["gx1", "capabilities", "amp", "nonexistent"]);
    expect(exitCode).toBe(1);
    const message = error.join("\n");
    expect(message).toContain('Unknown item "nonexistent"');
    expect(message).toContain("JC-120");
  });
});
