import { Command } from "commander";
import { registry } from "@tonesmith/core";
import { devices } from "./devices";

const buildProgram = (): Command => {
  const program = new Command();
  program
    .name("tonesmith")
    .description("multi-device guitar processor patch toolkit");

  for (const device of devices) {
    const driver = registry.requireDriver(device.id);
    const cmd = program.command(device.id).description(device.description);
    device.configure(cmd, driver);
  }

  return program;
};

export { buildProgram };
