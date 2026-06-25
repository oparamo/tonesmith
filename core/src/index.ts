import { drivers } from "./devices/index";
import { registerDriver } from "./registry";

for (const driver of drivers) {
  registerDriver(driver);
}

export type { Patch, PatchFile, RawPatch, PatchDriver, DeviceCapabilities, CapabilityGroup, CapabilityItem, ParamSpec } from "./types/index";
export * as patchUtils from "./patch-utils";
export * as registry from "./registry";

export * as gx1 from "./devices/gx1/index";
