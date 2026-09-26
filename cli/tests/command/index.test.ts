import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { configureDeviceCommands } from "../../src/command";
import { fakeDriver } from "../helpers";

describe("configureDeviceCommands", () => {
  it("registers read, write, copy, new, capabilities, in that order", () => {
    const cmd = new Command("fake");

    configureDeviceCommands(cmd, fakeDriver());

    expect(cmd.commands.map(command => command.name())).toStrictEqual([
      "read", "write", "copy", "new", "capabilities",
    ]);
  });
});
