import { describe, it, expect } from "vitest";
import { registry } from "@tonesmith/core";
import { buildProgram } from "../src/program";
import packageJson from "../package.json" with { type: "json" };

describe("buildProgram", () => {
  it("reports the package version", () => {
    expect(buildProgram().version()).toBe(packageJson.version);
  });

  it.each(registry.listDrivers().map(driver => [driver.id, driver.name] as const))(
    "registers %s as a subcommand, described %s",
    (id, name) => {
      const subcommand = buildProgram().commands.find(command => command.name() === id);

      expect(subcommand?.description()).toBe(name);
    }
  );
});
