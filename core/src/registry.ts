import type { PatchDriver } from "./types/index.js";

const drivers = new Map<string, PatchDriver>();

const registerDriver = (driver: PatchDriver): void => {
  drivers.set(driver.id, driver);
};

const getDriver = (id: string): PatchDriver | undefined => drivers.get(id);

const listDrivers = (): PatchDriver[] => Array.from(drivers.values());

export { registerDriver, getDriver, listDrivers };
