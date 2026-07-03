/** A single parameter on a capability item or group (informational; not used for encoding). */
interface ParamSpec {
  name: string;
  /** Free text: "0–100", "–12–+12 semitones", enum list, etc. */
  range: string;
  description: string;
}

/**
 * A selectable option within a capability group — an amp model, effect type, drive pedal,
 * reverb type, cab, mic, etc.
 */
interface CapabilityItem {
  /** The string value used in patches (must match the codec's lookup arrays exactly). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Sonic description — what the item sounds like or does. */
  description: string;
  /** Real-world gear this item emulates, where applicable. */
  models?: string;
  /** Nested selectable variants within this item (e.g. the compressor types, drive pedal types). */
  subTypes?: CapabilityItem[];
  /** Parameters specific to this item (supplement the group's shared params). */
  params?: ParamSpec[];
}

/**
 * A top-level block in the device's signal chain — amp, fx slot, delay, reverb, etc.
 * The `items` array lists selectable models/types within the block.
 * The `params` array lists controls that are always present regardless of the selected item.
 */
interface CapabilityGroup {
  /** Stable identifier, e.g. "amp", "fx", "odds", "delay", "reverb", "cab", "mic", "ns", "fv". */
  id: string;
  name: string;
  /** What this block does in the signal chain. */
  description: string;
  /** Selectable types/models for this block. */
  items: CapabilityItem[];
  /** Block-level controls shared across all selected items. */
  params?: ParamSpec[];
}

/** All capability metadata for a device. */
interface DeviceCapabilities {
  groups: CapabilityGroup[];
}

export type { ParamSpec, CapabilityItem, CapabilityGroup, DeviceCapabilities };
