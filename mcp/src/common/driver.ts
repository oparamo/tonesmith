import { registry } from "@tonesmith/core";
import type { PatchDriver } from "@tonesmith/core";

const requireDriver = (device: string): PatchDriver => {
  const driver = registry.getDriver(device);
  if (!driver) throw new Error(`Unknown device '${device}'. Use list_devices to see supported IDs.`);
  return driver;
};

export { requireDriver };
