import { drivers } from "./devices";
import { registerDriver } from "./registry";

for (const driver of drivers) {
  registerDriver(driver);
}

export type {
  Patch, PatchFile, PatchView, Encodable, RawPatch, FieldValue, FieldEdits, PatchDriver,
  DeviceCapabilities, CapabilityGroup, CapabilityItem, ChainSpec, PatchNameSpec, PatchSpecExample,
  ParamSpec, NumericParam, DiscreteParam, BooleanParam,
} from "./types";
export * as patchUtils from "./patch-utils";
export * as patchView from "./patch-view";
export * as capabilityUtils from "./capability-utils";
export * as registry from "./registry";

export * as gx1 from "./devices/gx1";
