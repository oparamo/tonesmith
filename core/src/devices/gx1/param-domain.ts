import type { ParamSpec } from "../../types";

interface RangeOpts { unit?: string; decimals?: number; bpm?: boolean; percent?: boolean }

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
 *  - `text`:    an opaque/compact range with no enumerable value list (e.g. "-2oct-+2oct").
 */
type Domain =
  | ({ kind: "range"; min: number; max: number } & RangeOpts)
  | { kind: "enum"; values: readonly string[] }
  | { kind: "lookup"; values: readonly string[]; display: string }
  | { kind: "boolean" }
  | { kind: "text"; display: string };

/** A numeric interval. `decimals` fixes display precision; `bpm`/`percent`/`unit` shape the suffix. */
const num = (min: number, max: number, opts: RangeOpts = {}): Domain => ({ kind: "range", min, max, ...opts });
/** A fixed set of string options; the display is the comma-joined list. */
const oneOf = (...values: string[]): Domain => ({ kind: "enum", values });
/** A quantized lookup table (values from a codec constant) with a compact human display. */
const lookupOf = (values: readonly string[], display: string): Domain => ({ kind: "lookup", values, display });
/** An on/off toggle carried as a real boolean (`true`/`false`). */
const bool = (): Domain => ({ kind: "boolean" });
/** An opaque/compact range with no enumerable value list. */
const text = (display: string): Domain => ({ kind: "text", display });

const fmt = (n: number, decimals?: number): string => (decimals === undefined ? String(n) : n.toFixed(decimals));

/** Renders a domain to its human `range` string (matches the device parameter-guide wording). */
const rangeText = (domain: Domain): string => {
  if (domain.kind === "enum") return domain.values.join(", ");
  if (domain.kind === "boolean") return "true, false";
  if (domain.kind === "lookup" || domain.kind === "text") return domain.display;
  const signedMax = domain.min < 0 && domain.max > 0 ? `+${fmt(domain.max, domain.decimals)}` : fmt(domain.max, domain.decimals);
  const base = `${fmt(domain.min, domain.decimals)}-${signedMax}`;
  let out = base;
  if (domain.percent) out = `${base}%`;
  else if (domain.unit) out = `${base} ${domain.unit}`;
  if (domain.bpm) out = `${out}, BPM`;
  return out;
};

const domainValues = (domain: Domain): readonly string[] | undefined =>
  domain.kind === "enum" || domain.kind === "lookup" ? domain.values : undefined;

/** Builds a ParamSpec from a name + domain + description, deriving range / values / min / max. */
const def = (name: string, domain: Domain, description: string): ParamSpec => {
  const spec: ParamSpec = { name, range: rangeText(domain), description };
  const values = domainValues(domain);
  if (values !== undefined) spec.values = values;
  if (domain.kind === "range") {
    spec.min = domain.min;
    spec.max = domain.max;
  }
  return spec;
};

export { num, oneOf, lookupOf, bool, text, def, rangeText };
export type { Domain };
