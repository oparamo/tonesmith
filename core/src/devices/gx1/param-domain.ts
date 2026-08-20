import type { NumericParam, ParamSpec } from "../../types";

interface RangeOpts { unit?: string; decimals?: number; percent?: boolean }

/** A numeric interval on its own, the half a tempo-syncable domain shares with a plain one. */
type RangeDomain = { kind: "range"; min: number; max: number } & RangeOpts;

/**
 * A param's value domain, the single authored source of its range. The human `range` string, the
 * machine-readable `values` list, and the numeric `min`/`max` bounds all derive from it via
 * `def()`, so they can't drift from each other. That is what lets the MCP generate schema read
 * bounds structurally, with no parsing of an English range string, and lets describe_device
 * surface exact enum values, all from one declaration.
 *
 * Kinds:
 *  - `range`:   a numeric interval, the only kind that yields machine `min`/`max` bounds.
 *  - `enum`:    a small fixed set of string values; the `range` display is the joined list.
 *  - `lookup`:  a discrete quantized table (the frequency steps) whose full value list comes from
 *               a codec constant but whose `range` display is a compact human summary.
 *  - `boolean`: an on/off toggle carried as a real boolean (`true`/`false`); no `values`/bounds.
 *  - `notes`:   a numeric interval that also takes the note values the device stores above it,
 *               so the bounds and the value list are both the param's own.
 *
 * There is no display-only kind. A domain is what gives a param a shape the validator can check
 * against, so a param whose domain were a bare string like "1:1-INF:1" would accept any value at
 * all. A compact display belongs on `lookup`, which carries the real value list beside it.
 */
type Domain =
  | RangeDomain
  | { kind: "enum"; values: readonly string[] }
  | { kind: "lookup"; values: readonly string[]; display: string }
  | { kind: "boolean" }
  | ({ kind: "notes"; values: readonly string[] } & Omit<RangeDomain, "kind">);

/** A numeric interval. `decimals` fixes display precision; `percent`/`unit` shape the suffix. */
const num = (min: number, max: number, opts: RangeOpts = {}): RangeDomain => ({ kind: "range", min, max, ...opts });

/**
 * A tempo-syncable param: everything its numeric interval takes, plus the note values the device
 * stores above that interval, in the order it counts them. Wrapping the interval rather than
 * restating it keeps the numeric half authored once, and mirrors how the codec wraps the field.
 */
const orNotes = (range: RangeDomain, notes: readonly string[]): Domain =>
  ({ ...range, kind: "notes", values: notes });

/** A fixed set of string options; the display is the comma-joined list. */
const oneOf = (...values: string[]): Domain => ({ kind: "enum", values });
/** A quantized lookup table (values from a codec constant) with a compact human display. */
const lookupOf = (values: readonly string[], display: string): Domain => ({ kind: "lookup", values, display });
/** An on/off toggle carried as a real boolean (`true`/`false`). */
const bool = (): Domain => ({ kind: "boolean" });

const fmt = (n: number, decimals?: number): string => (decimals === undefined ? String(n) : n.toFixed(decimals));

/** Renders a domain to its human `range` string (matches the device parameter-guide wording). */
const rangeText = (domain: Domain): string => {
  if (domain.kind === "enum") return domain.values.join(", ");
  if (domain.kind === "boolean") return "true, false";
  if (domain.kind === "lookup") return domain.display;
  const signedMax = domain.min < 0 && domain.max > 0 ? `+${fmt(domain.max, domain.decimals)}` : fmt(domain.max, domain.decimals);
  const base = `${fmt(domain.min, domain.decimals)}-${signedMax}`;
  let out = base;
  if (domain.percent) out = `${base}%`;
  else if (domain.unit) out = `${base} ${domain.unit}`;
  // The ends of the list rather than all 18 of it, since `values` carries the full set and the two
  // ends are what say which way the device counts: a rate runs from the longest note down.
  if (domain.kind === "notes") out = `${out}, or a note value from ${domain.values[0]} to ${domain.values.at(-1)}`;
  return out;
};

/** Builds a ParamSpec from a name + domain + description, deriving range / values / bounds. */
const def = (name: string, domain: Domain, description: string): ParamSpec => {
  const base = { name, range: rangeText(domain), description };
  if (domain.kind === "boolean") return { ...base, kind: "boolean" };
  if (domain.kind === "enum" || domain.kind === "lookup") return { ...base, kind: "discrete", values: domain.values };
  const bounds = { min: domain.min, max: domain.max };
  if (domain.kind === "notes") return { ...base, kind: "numericOrNamed", ...bounds, values: domain.values };

  const numeric: NumericParam = { ...base, kind: "numeric", ...bounds };
  if (domain.decimals !== undefined) numeric.decimals = domain.decimals;
  return numeric;
};

export { num, oneOf, lookupOf, bool, orNotes, def, rangeText };
export type { Domain, RangeDomain };
