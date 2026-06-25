import { registry } from "tonesmith";
import type { PatchDriver } from "tonesmith";

const requireDriver = (device: string): PatchDriver => {
  const driver = registry.getDriver(device);
  if (!driver) throw new Error(`Unknown device '${device}'. Use list_devices to see supported IDs.`);
  return driver;
};

export { requireDriver };
