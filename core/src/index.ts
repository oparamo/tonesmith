// The composition root: the one place the roster is registered and the public surface assembled.
// Drivers don't register themselves, so importing a device module has no side effect.
import { drivers } from "./device";
import { registerDriver } from "./service/registry";

for (const driver of drivers) {
  registerDriver(driver);
}

export type {
  FieldValue, PatchBlock, Patch, PatchFile, FieldEdit, FieldEdits, PatchDriver,
  PatchDetail, BlockView, PatchView,
  DeviceCapabilities, CapabilityGroup, CapabilityType, ChainBlock, ChainSpec, ChainView, CapabilityLookup,
  PatchNameSpec, PatchSpecExample,
  ParamSpec, NumericParam, DiscreteParam, BooleanParam, NumericOrNamedParam,
} from "./model";
export * as patchService from "./service/patchService";
export * as capabilityService from "./service/capabilityService";
export * as registry from "./service/registry";
export { messageOf } from "./common/error";

export * as gx1 from "./device/gx1";
