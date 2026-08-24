/** What every parameter carries, whatever kind of value it takes. */
interface ParamSpecBase {
  name: string;
  /**
   * The exact property key for this param in machine surfaces: the field name in decoded
   * patches (`read_patch` output), and the key it is written under when building a patch.
   * Where that key sits within the block varies by block, so the `example` on the group or type
   * is what shows the placement. Distinct from `name`, which is the label the device's own panel
   * prints and is free to punctuate and abbreviate however it likes. Absent on a param with no
   * codec field of its own, whose value the patch stores outside the block.
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
   * Decimal places this param accepts, present only where it takes fractional values, as a time
   * in seconds does. Absent means whole numbers only, which is the common case. A consumer
   * building a schema needs this to know whether to reject 4.5: the bounds alone can't say, since
   * a fractional param's own min and max are often whole numbers.
   */
  decimals?: number;
}

/**
 * A param taking one of a fixed set of strings. `values` is the machine-readable companion to
 * `range`, which for a long table of values is only a compact summary, so a consumer can
 * enumerate the exact labels instead of guessing their spelling.
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
 * A param taking either a number within `min`-`max` or one of `values`, which name settings the
 * device stores above that range instead of more of the same quantity, such as a time it plays
 * against the patch tempo rather than as a fixed span.
 *
 * Both forms are ordinary stored values, so both are what a patch reads back as and what a
 * consumer may write. A spec that offered only the numeric half would present the named settings
 * as out-of-range numbers, which reads as a value someone should correct.
 */
interface NumericOrNamedParam extends ParamSpecBase {
  kind: "numericOrNamed";
  min: number;
  max: number;
  values: readonly string[];
}

/**
 * A single parameter on a capability type or group (informational; not used for encoding).
 *
 * `kind` is what a value is checked and built against, so it is a discriminant rather than a hint.
 * A param that takes a number and a set of named settings alike says so as its own kind, rather
 * than as a numeric spec carrying an optional value list: an optional list leaves a consumer to
 * guess whether both forms are legal or whether one of them was authored by mistake.
 */
type ParamSpec = NumericParam | DiscreteParam | BooleanParam | NumericOrNamedParam;

/**
 * A patch-spec fragment for one block, keyed by the block's own name in a spec and filled with the
 * device's factory defaults, ready to pass to `PatchDriver.buildPatch` once a patch `name` is added.
 *
 * It answers what a list of param keys cannot: which selectors this type needs set alongside its
 * controls, and the exact spelling of every key, as one fragment a consumer copies rather than
 * assembles. Getting either wrong is learned by being rejected, with the patch already built.
 */
type PatchSpecExample = Record<string, unknown>;

/** One of the types a block offers to select between. */
interface CapabilityType {
  /** The string value used in patches (must match the codec's lookup arrays exactly). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Sonic description: what the type sounds like or does. */
  description: string;
  /** Real-world gear this type emulates, where applicable. */
  models?: string;
  /** Nested selectable variants, where one type covers several named models. */
  subTypes?: CapabilityType[];
  /** Parameters specific to this type (supplement the group's shared params). */
  params?: ParamSpec[];
  /** A spec fragment selecting this type, at factory defaults. Absent where the type names no block. */
  example?: PatchSpecExample;
}

/**
 * A top-level block in the device's signal chain. The `types` array lists the types selectable
 * within the block. The `params` array lists controls that are always present regardless of the
 * selected type.
 */
interface CapabilityGroup {
  /** Stable identifier: the string a consumer names this group by. */
  id: string;
  name: string;
  /** What this block does in the signal chain. */
  description: string;
  /** Selectable types for this block. */
  types: CapabilityType[];
  /** Block-level controls shared across every type. */
  params?: ParamSpec[];
  /**
   * A spec fragment for this block at factory defaults, carried by the groups that offer no types
   * to choose between. Where a group has types, each type carries its own instead.
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
  /**
   * Each block name mapped to what the device's own panel calls it. A patch spec always writes the
   * name; the label is what a manual, a photo of the unit, or a printout shows, and the two differ
   * whenever a device's label is an abbreviation nobody would guess a key from.
   */
  blocks: Record<string, string>;
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
  /**
   * Settings the patch carries itself rather than through any block, such as a reference tempo or
   * an overall output trim. Each is written at the top level of a patch spec, beside `name`, and
   * read back there. A consumer that browses `groups` alone never meets them, so a device with
   * settings of this kind has to say so here or leave them undiscoverable.
   */
  patchSettings: ParamSpec[];
  groups: CapabilityGroup[];
}

export type {
  ParamSpec, NumericParam, DiscreteParam, BooleanParam, NumericOrNamedParam, PatchSpecExample, CapabilityType,
  CapabilityGroup, ChainSpec, PatchNameSpec, DeviceCapabilities,
};
