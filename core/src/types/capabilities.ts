/** A single parameter on a capability item or group (informational; not used for encoding). */
interface ParamSpec {
  name: string;
  /**
   * The exact property key for this param in machine surfaces: the field name in decoded
   * patches (`read_patch` output), and the key to use inside a block's `params` record when
   * building a patch. Distinct from `name`, which is the human display label
   * ("PRE-DELAY" vs `preDelay`, "OCT F-BACK" vs `octFeedback`). Absent only for params with
   * no backing codec field (e.g. HARMONIST's KEY, which is the patch-level key).
   */
  key?: string;
  /** Free text: "0–100", "–12–+12 semitones", enum list, etc. Derived from the param's domain. */
  range: string;
  /**
   * Machine-readable numeric bounds, present only for numeric params (derived from a `range`-kind
   * domain). Lets a consumer (e.g. the MCP generate schema) apply min/max without parsing `range`.
   */
  min?: number;
  max?: number;
  description: string;
  /**
   * For discrete lookup-valued params whose `range` is only a compact summary (e.g. the
   * 1/3-octave frequency tables), the full ordered list of exact valid labels. It is the
   * machine-readable companion to `range`, so a consumer can enumerate the valid values
   * instead of guessing their spelling. Omitted for plain numeric params and for short
   * enums that already spell their values out in `range`.
   */
  values?: readonly string[];
}

/**
 * A selectable option within a capability group: an amp model, effect type, drive pedal,
 * reverb type, cab, mic, etc.
 */
interface CapabilityItem {
  /** The string value used in patches (must match the codec's lookup arrays exactly). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Sonic description: what the item sounds like or does. */
  description: string;
  /** Real-world gear this item emulates, where applicable. */
  models?: string;
  /** Nested selectable variants within this item (e.g. the compressor types, drive pedal types). */
  subTypes?: CapabilityItem[];
  /** Parameters specific to this item (supplement the group's shared params). */
  params?: ParamSpec[];
}

/**
 * A top-level block in the device's signal chain: amp, fx slot, delay, reverb, etc.
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

/**
 * The device's signal-chain model: how blocks are ordered and how they're turned on/off. Every
 * device has one; it's the first thing to consult before building a patch. The block names and
 * specifics stay device-side, in each device's own `ChainSpec`.
 */
interface ChainSpec {
  /** Prose account of how the chain works: ordering, bypass, and the default arrangement. */
  description: string;
  /** The canonical block order used when a patch doesn't specify one. */
  defaultOrder: string[];
}

/** All capability metadata for a device. */
interface DeviceCapabilities {
  /** The device's signal chain: block order and how blocks are reordered/bypassed. */
  chain: ChainSpec;
  groups: CapabilityGroup[];
}

export type { ParamSpec, CapabilityItem, CapabilityGroup, ChainSpec, DeviceCapabilities };
