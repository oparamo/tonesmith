import type { DeviceCapabilities, CapabilityGroup, CapabilityItem } from "./types";

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
const findItem = (group: CapabilityGroup, id: string): CapabilityItem => {
  const needle = id.toUpperCase();
  const found =
    group.items.find(item => item.id.toUpperCase() === needle) ??
    group.items.find(item => item.name.toUpperCase().startsWith(needle));
  if (!found) {
    const ids = group.items.map(item => item.id).join(", ");
    throw new Error(`Unknown item "${id}" in group "${group.id}". Available: ${ids}`);
  }
  return found;
};

export { findGroup, findItem };
