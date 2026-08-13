/** What every parameter carries, whatever kind of value it takes. */
interface ParamSpecBase {
  name: string;
  /**
   * The exact property key for this param in machine surfaces: the field name in decoded
   * patches (`read_patch` output), and the key it is written under when building a patch.
   * Where that key sits within the block varies by block, so the `example` on the group or item
   * is what shows the placement. Distinct from `name`, which is the human display label
   * ("PRE-DELAY" vs `preDelay`, "OCT F-BACK" vs `octFeedback`). Absent only for params with
   * no backing codec field (e.g. HARMONIST's KEY, which is the patch-level key).
   */
  key?: string;
  /** Free text: "0–100", "–12–+12 semitones", enum list, etc. Derived from the param's domain. */
  range: string;
  description: string;
}

/** A param taking a number, bounded by `min` and `max`. */
interface NumericParam extends ParamSpecBase {
  kind: "numeric";
  min: number;
  max: number;
  /**
   * Decimal places this param accepts, present only where it takes fractional values (reverb TIME
   * runs 0.1-10.0 s). Absent means whole numbers only, which is the common case. A consumer
   * building a schema needs this to know whether to reject 4.5: the bounds alone can't say, since
   * a fractional param's own min and max are often whole numbers.
   */
  decimals?: number;
}

/**
 * A param taking one of a fixed set of strings. `values` is the machine-readable companion to
 * `range`, which for a long table (the 1/3-octave frequencies) is only a compact summary, so a
 * consumer can enumerate the exact labels instead of guessing their spelling.
 */
interface DiscreteParam extends ParamSpecBase {
  kind: "discrete";
  values: readonly string[];
}

/** A param taking a real boolean, not a number or a string. */
interface BooleanParam extends ParamSpecBase {
  kind: "boolean";
}

/**
 * A single parameter on a capability item or group (informational; not used for encoding).
 *
 * `kind` is what a value is checked and built against, so it is a discriminant rather than a hint:
 * the three kinds are mutually exclusive, and a spec carrying both bounds and a value list would
 * describe nothing a consumer could act on.
 */
type ParamSpec = NumericParam | DiscreteParam | BooleanParam;

/**
 * A patch-spec fragment for one block, keyed by the block's own name in a spec and filled with the
 * device's factory defaults, ready to pass to `PatchDriver.buildPatch` once a patch `name` is added.
 *
 * It exists to answer where a param is written, which a list of param keys cannot: a device is free
 * to nest a block's controls or carry them flat, and that is device knowledge a consumer would
 * otherwise learn by being rejected, having already built the patch. Showing a real fragment also
 * avoids inventing a vocabulary to describe nesting in words.
 */
type PatchSpecExample = Record<string, unknown>;

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
  /** A spec fragment selecting this item, at factory defaults. Absent where the item names no block. */
  example?: PatchSpecExample;
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
  /**
   * A spec fragment for this block at factory defaults, carried by the groups that offer no types
   * to choose between. Where a group has items, each item carries its own instead.
   */
  example?: PatchSpecExample;
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

/**
 * Limits on the patch name, which no capability group covers: the name belongs to the patch rather
 * than to any block. A consumer that finds out by being rejected has already built the patch, so
 * this has to be readable up front.
 */
interface PatchNameSpec {
  /** Longest name the device's file format stores. */
  maxLength: number;
}

/** All capability metadata for a device. */
interface DeviceCapabilities {
  /** The device's signal chain: block order and how blocks are reordered/bypassed. */
  chain: ChainSpec;
  /** What the device will accept as a patch name. */
  patchName: PatchNameSpec;
  groups: CapabilityGroup[];
}

export type {
  ParamSpec, NumericParam, DiscreteParam, BooleanParam, PatchSpecExample, CapabilityItem,
  CapabilityGroup, ChainSpec, PatchNameSpec, DeviceCapabilities,
};
