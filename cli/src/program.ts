import { Command } from "commander";
import { registry } from "@tonesmith/core";
import { devices } from "./devices";
import packageJson from "../package.json" with { type: "json" };

const buildProgram = (): Command => {
  const program = new Command();
  program
    .name("tonesmith")
    .description("multi-device guitar processor patch toolkit")
    .version(packageJson.version);

  for (const device of devices) {
    const driver = registry.getDriver(device.id);
    const cmd = program.command(device.id).description(driver.name);
    device.configure(cmd, driver);
  }

  return program;
};

export { buildProgram };
