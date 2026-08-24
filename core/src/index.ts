import { drivers } from "./devices";
import { registerDriver } from "./registry";

for (const driver of drivers) {
  registerDriver(driver);
}

export type {
  FieldValue, PatchBlock, Patch, PatchFile, RawPatch, FieldEdit, FieldEdits, PatchDriver,
  PatchDetail, BlockView, PatchView,
  DeviceCapabilities, CapabilityGroup, CapabilityType, ChainSpec, PatchNameSpec, PatchSpecExample,
  ParamSpec, NumericParam, DiscreteParam, BooleanParam, NumericOrNamedParam,
} from "./types";
export * as patchUtils from "./patch-utils";
export * as capabilityUtils from "./capability-utils";
export * as registry from "./registry";

export * as gx1 from "./devices/gx1";
