import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/**
 * Points at one param in the gx1 capability catalog.
 *
 * `type` names one type within a per-type block (delay/reverb), for the value sets a flat schema
 * field states on behalf of every type; omit it for single-shape blocks (amp/odds/ns/fv). Numeric
 * bounds no longer work this way, since one type cannot speak for the others' ranges: see
 * `SpanRef`. `note` carries builder behavior the catalog has no opinion on, such as what an omitted
 * field defaults to.
 */
interface ParamRef {
  group: string;
  param: string;
  type?: string;
  note?: string;
}

/**
 * Points at one param that a single flat schema field has to serve for every type in a group.
 *
 * delay and reverb expose their common controls as named fields, but each type declares its own
 * version of them, so there is no single ParamSpec to read. `description` is written here rather
 * than taken from the catalog because the per-type prose genuinely differs (reverb TIME is a decay
 * time for the halls and a delay time for SUB DELAY) and no catalog entry describes the union.
 */
interface SpanRef {
  group: string;
  param: string;
  description: string;
  note?: string;
}

/** Which param a span covers. The prose a `SpanRef` adds has no bearing on the bounds. */
type SpanTarget = Pick<SpanRef, "group" | "param">;

/** Where a ref points, for error messages: `group "amp"`, or `delay type "STANDARD"`. */
const refLabel = ({ group, type }: ParamRef): string =>
  type === undefined ? `group "${group}"` : `${group} type "${type}"`;

/** Looks up a param's ParamSpec, from a group's shared params or a per-type item's params. */
const paramFor = (ref: ParamRef): ParamSpec => {
  const group = capabilityUtils.findGroup(capabilities, ref.group);
  const params = ref.type === undefined ? group.params : capabilityUtils.findItem(group, ref.type).params;
  const param = params?.find(spec => spec.name === ref.param);
  if (!param) throw new Error(`No ParamSpec "${ref.param}" in capabilities ${refLabel(ref)}`);
  return param;
};

/**
 * The catalog-declared numeric `min`/`max` for a param, read straight off the ParamSpec (the
 * catalog derives them from each param's structured domain). Throws if the param isn't numeric,
 * since an enum has no bounds: a mis-mapped field then fails loudly at load rather than yielding a
 * silently unbounded number.
 */
const boundsFor = (ref: ParamRef): { min: number; max: number } => {
  const param = paramFor(ref);
  if (param.min === undefined || param.max === undefined) {
    throw new Error(`ParamSpec "${ref.param}" in ${refLabel(ref)} has no numeric bounds`);
  }
  return { min: param.min, max: param.max };
};

/**
 * Stated only for numeric params. An enum's `range` is its value list, and the schema surfaces
 * those through `capabilityParamValues` on the fields that need them, spelled exactly rather than
 * summarized.
 */
const rangeClause = (spec: ParamSpec): string | undefined =>
  spec.min === undefined ? undefined : `Range ${spec.range}.`;

/**
 * The sentence an agent reads for a param, composed from the catalog's own prose and range.
 *
 * Retyping the range beside the schema field is what drifts: zod goes on enforcing the catalog's
 * bounds while the description keeps quoting whatever the range was when someone typed it, and no
 * test catches it, because the bound itself is still right.
 */
const describeParam = (ref: ParamRef): string => {
  const spec = paramFor(ref);
  const sentences = [spec.description];

  const range = rangeClause(spec);
  if (range !== undefined) sentences.push(range);
  if (ref.note !== undefined) sentences.push(ref.note);

  return sentences.join(" ");
};

/**
 * Applies bounds and a description to a `z.number()` base. Bounds land after the base rather than
 * before it: zod v4 lets a trailing `.int()` clobber earlier min/max in the emitted JSON schema, so
 * `.int()` has to be on the base already (see `boundedInt` and `spanningInt`).
 */
const applyBounds = (base: z.ZodNumber, bounds: { min: number; max: number }, description: string): z.ZodNumber =>
  base.min(bounds.min).max(bounds.max).describe(description);

/** A catalog-bounded integer, `.int()` applied before the bounds so both survive to JSON schema. */
const boundedInt = (ref: ParamRef): z.ZodNumber =>
  applyBounds(z.number().int(), boundsFor(ref), describeParam(ref));

/** Every ParamSpec declaring `param`, across all of a group's types, in item order. */
const specsAcrossTypes = (ref: SpanTarget): ParamSpec[] =>
  capabilityUtils.findGroup(capabilities, ref.group).items
    .flatMap(item => item.params?.filter(spec => spec.name === ref.param) ?? []);

/** The numeric bounds among a set of specs, dropping the enum and boolean ones that have none. */
const numericBounds = (specs: ParamSpec[]): { min: number; max: number }[] =>
  specs.flatMap(spec => (spec.min === undefined || spec.max === undefined ? [] : [{ min: spec.min, max: spec.max }]));

/**
 * Bounds wide enough for every type that declares the param.
 *
 * Bounding by one representative type is what made valid values unreachable: zod rejected them
 * before `validateTypeParams` ran its per-type check, so SHIMMER reverb could not take LEVEL 0 and
 * SUB DELAY could not take a TIME above 10, which is nearly its whole 1-2000 ms range. The span is
 * only an outer sanity gate. The chosen type's real range is still enforced, and it is the one that
 * produces the error a caller reads.
 */
const spanFor = (ref: SpanTarget): { min: number; max: number } => {
  const bounds = numericBounds(specsAcrossTypes(ref));
  if (bounds.length === 0) {
    throw new Error(`No numeric ParamSpec "${ref.param}" on any "${ref.group}" type`);
  }
  return {
    min: Math.min(...bounds.map(bound => bound.min)),
    max: Math.max(...bounds.map(bound => bound.max)),
  };
};

/**
 * Every spanning field says this instead of a range. The span it enforces is the union across
 * types, which is the wrong number to quote at a caller: reverb TIME spans 0.1 (seconds, halls) to
 * 2000 (milliseconds, SUB DELAY), a range in no single unit that no type actually accepts.
 */
const PER_TYPE_RANGE_CLAUSE = "Exact range and unit depend on `type`; see describe_device.";

const describeSpan = (ref: SpanRef): string =>
  [ref.description, PER_TYPE_RANGE_CLAUSE, ref.note].filter(part => part !== undefined).join(" ");

/** A span-bounded floating-point number, for a flat field serving every type in a group. */
const spanningNumber = (ref: SpanRef): z.ZodNumber =>
  applyBounds(z.number(), spanFor(ref), describeSpan(ref));

/** A span-bounded integer, `.int()` applied before the bounds so both survive to JSON schema. */
const spanningInt = (ref: SpanRef): z.ZodNumber =>
  applyBounds(z.number().int(), spanFor(ref), describeSpan(ref));

export {
  boundedInt, boundsFor, paramFor, describeParam, refLabel,
  spanningNumber, spanningInt, spanFor,
};
export type { ParamRef, SpanRef };
