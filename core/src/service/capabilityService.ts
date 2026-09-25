import type { DeviceCapabilities, CapabilityGroup, CapabilityType, CapabilityLookup } from "../model";

/**
 * The name the chain answers to wherever a group id is accepted. It sits beside the groups in every
 * listing, so it matches the way they do: case-insensitively.
 */
const CHAIN_ENTRY = "chain";

/** Case-insensitive lookup; throws when no group matches. */
const findGroup = (caps: DeviceCapabilities, id: string): CapabilityGroup => {
  const needle = id.toLowerCase();
  const found = caps.groups.find(group => group.id.toLowerCase() === needle);
  if (!found) {
    const ids = caps.groups.map(group => group.id).join(", ");
    throw new Error(`Unknown group "${id}". Available: ${ids}`);
  }
  return found;
};

/**
 * Case-insensitive lookup by id, falling back to a name prefix so a caller can pass the leading
 * words of a display name. Throws when nothing matches.
 */
const findType = (group: CapabilityGroup, id: string): CapabilityType => {
  const needle = id.toUpperCase();
  const found =
    group.types.find(type => type.id.toUpperCase() === needle) ??
    group.types.find(type => type.name.toUpperCase().startsWith(needle));
  if (!found) {
    const ids = group.types.map(type => type.id).join(", ");
    throw new Error(`Unknown type "${id}" in group "${group.id}". Available: ${ids}`);
  }
  return found;
};

/**
 * Resolves what a caller asked to see: the chain, a group, or a type within a group. A type id on
 * the chain is refused, the way an unknown type in a group is, rather than ignored.
 */
const lookup = (caps: DeviceCapabilities, groupId: string, typeId?: string): CapabilityLookup => {
  if (groupId.toLowerCase() === CHAIN_ENTRY) {
    if (typeId !== undefined) {
      throw new Error(`The chain has no types, so there is no "${typeId}" to show.`);
    }
    const { chain, patchName, patchSettings } = caps;
    return { kind: "chain", chain: { ...chain, patchName, patchSettings } };
  }

  const group = findGroup(caps, groupId);
  if (typeId === undefined) return { kind: "group", group };

  const found = findType(group, typeId);
  const params = [...(group.params ?? []), ...(found.params ?? [])];
  return { kind: "type", group, type: { ...found, params } };
};

export { CHAIN_ENTRY, findGroup, findType, lookup };
