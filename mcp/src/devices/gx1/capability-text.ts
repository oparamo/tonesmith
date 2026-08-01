import { gx1, capabilityUtils } from "@tonesmith/core";
import { paramFor, refLabel } from "./param-ref";
import type { ParamRef } from "./param-ref";

const capabilities = gx1.driver.capabilities;

/**
 * The value sets named in the generate schema's field descriptions are built from capabilities here,
 * never typed by hand. A field's allowed values are reference data an agent needs while filling that
 * field in, so they belong in the description rather than only in describe_device — but writing them
 * out would let the schema drift from the device the moment a type is added or renamed.
 */

/** Every item id in a capability group, comma-separated (e.g. every amp model). */
const capabilityItemIds = (groupId: string): string =>
  capabilityUtils.findGroup(capabilities, groupId).items.map(item => item.id).join(", ");

/**
 * A param's allowed values, comma-separated. A ref naming a `type` picks a representative type for
 * per-type blocks whose flat schema field can't express per-type value sets, which is sound only
 * where every type shares the same set, and that is what the schema-drift guard pins.
 */
const capabilityParamValues = (ref: ParamRef): string => {
  const param = paramFor(ref);
  if (param.values === undefined) {
    throw new Error(`ParamSpec "${ref.param}" in ${refLabel(ref)} has no discrete values`);
  }
  return param.values.join(", ");
};

export { capabilityItemIds, capabilityParamValues };
