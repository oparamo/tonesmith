#!/usr/bin/env node
import { Command } from "commander";
import { registry } from "tonesmith";
import { devices } from "./devices";

const program = new Command();
program
  .name("tonesmith")
  .description("multi-device guitar processor patch toolkit");

for (const device of devices) {
  const driver = registry.getDriver(device.id);
  if (!driver) throw new Error(`No driver registered for device: ${device.id}`);

  const cmd = program.command(device.id).description(device.description);
  device.configure(cmd, driver);
}

program.parse();
