import { gx1, capabilityUtils } from "@tonesmith/core";
import { paramFor } from "./bounds";

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
 * A param's allowed values, comma-separated. `typeId` picks a representative type for per-type
 * blocks whose flat schema field can't express per-type value sets — sound only where every type
 * shares the same set, which the schema-drift guard pins.
 */
const capabilityParamValues = (groupId: string, paramName: string, typeId?: string): string => {
  const param = paramFor(groupId, paramName, typeId);
  const where = typeId === undefined ? `group "${groupId}"` : `${groupId} type "${typeId}"`;
  if (param.values === undefined) throw new Error(`ParamSpec "${paramName}" in ${where} has no discrete values`);
  return param.values.join(", ");
};

export { capabilityItemIds, capabilityParamValues };
