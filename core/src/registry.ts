import type { PatchDriver } from "./types";

const drivers = new Map<string, PatchDriver>();

const registerDriver = (driver: PatchDriver): void => {
  drivers.set(driver.id, driver);
};

const listDrivers = (): PatchDriver[] => Array.from(drivers.values());

/**
 * Look up a driver by id, throwing a descriptive error listing the registered ids if none
 * matches. Shared by the CLI (device dispatch) and the MCP server (per-call device validation).
 */
const getDriver = (id: string): PatchDriver => {
  const driver = drivers.get(id);
  if (!driver) {
    const registered = listDrivers().map(driver => driver.id).join(", ");
    throw new Error(`Unknown device "${id}". Registered devices: ${registered}`);
  }
  return driver;
};

export { registerDriver, getDriver, listDrivers };
