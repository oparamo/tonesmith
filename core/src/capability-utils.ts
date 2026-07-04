import type { DeviceCapabilities, CapabilityGroup, CapabilityItem } from "./types";

/**
 * Find a capability group by id (case-insensitive).
 * Throws with a descriptive message listing available group ids when not found.
 */
const findGroup = (caps: DeviceCapabilities, id: string): CapabilityGroup => {
  const needle = id.toLowerCase();
  const found = caps.groups.find(group => group.id.toLowerCase() === needle);
  if (!found) {
    const ids = caps.groups.map(group => group.id).join(", ");
    throw new Error(`Unknown group ${JSON.stringify(id)}. Available: ${ids}`);
  }
  return found;
};

/**
 * Find a capability item within a group by id (case-insensitive) or by name prefix.
 * Throws with a descriptive message listing available item ids when not found.
 */
const findItem = (group: CapabilityGroup, id: string): CapabilityItem => {
  const needle = id.toUpperCase();
  const found =
    group.items.find(item => item.id.toUpperCase() === needle) ??
    group.items.find(item => item.name.toUpperCase().startsWith(needle));
  if (!found) {
    const ids = group.items.map(item => item.id).join(", ");
    throw new Error(`Unknown item ${JSON.stringify(id)} in group ${JSON.stringify(group.id)}. Available: ${ids}`);
  }
  return found;
};

export { findGroup, findItem };
