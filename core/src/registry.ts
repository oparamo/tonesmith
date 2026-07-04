import type { PatchDriver } from "./types";

const drivers = new Map<string, PatchDriver>();

const registerDriver = (driver: PatchDriver): void => {
  drivers.set(driver.id, driver);
};

const getDriver = (id: string): PatchDriver | undefined => drivers.get(id);

const listDrivers = (): PatchDriver[] => Array.from(drivers.values());

/**
 * Look up a driver by id, throwing a descriptive error if none is registered.
 * Shared by the CLI (device dispatch) and the MCP server (per-call device validation).
 */
const requireDriver = (id: string): PatchDriver => {
  const driver = getDriver(id);
  if (!driver) throw new Error(`Unknown device ${JSON.stringify(id)}. No driver is registered for this id.`);
  return driver;
};

export { registerDriver, getDriver, listDrivers, requireDriver };
