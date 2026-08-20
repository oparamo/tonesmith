import { Command } from "commander";
import { registry } from "@tonesmith/core";
import { configureDeviceCommands } from "./common";
import packageJson from "../package.json" with { type: "json" };

const buildProgram = (): Command => {
  const program = new Command();
  program
    .name("tonesmith")
    .description("multi-device guitar processor patch toolkit")
    .version(packageJson.version);

  for (const driver of registry.listDrivers()) {
    const cmd = program.command(driver.id).description(driver.name);
    configureDeviceCommands(cmd, driver);
  }

  return program;
};

export { buildProgram };
