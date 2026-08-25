import type { DeviceCapabilities, CapabilityGroup, CapabilityType } from "./types";

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

export { findGroup, findType };
