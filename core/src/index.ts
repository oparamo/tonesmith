import { drivers } from "./devices/index.js";
import { registerDriver } from "./registry.js";

for (const driver of drivers) {
  registerDriver(driver);
}

export type { Patch, PatchFile, RawPatch, PatchDriver, DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec } from "./types/index.js";
export * as patchUtils from "./patch-utils.js";
export * as registry from "./registry.js";

export * as gx1 from "./devices/gx1/index.js";
