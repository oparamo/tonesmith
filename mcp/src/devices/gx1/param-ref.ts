import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/**
 * Points at one param in the gx1 capability catalog.
 *
 * `type` names the representative type for per-type blocks (delay/reverb) whose flat schema field
 * can't express per-type ranges; omit it for single-shape blocks (amp/odds/ns/fv). `note` carries
 * builder behavior the catalog has no opinion on, such as what an omitted field defaults to.
 */
interface ParamRef {
  group: string;
  param: string;
  type?: string;
  note?: string;
}

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
 * Applies the catalog's bounds and description to a `z.number()` base. Bounds land after the base
 * rather than before it: zod v4 lets a trailing `.int()` clobber earlier min/max in the emitted
 * JSON schema, so `.int()` has to be on the base already (see `boundedInt`).
 */
const applyCatalog = (base: z.ZodNumber, ref: ParamRef): z.ZodNumber => {
  const { min, max } = boundsFor(ref);
  return base.min(min).max(max).describe(describeParam(ref));
};

/** A catalog-bounded, catalog-described floating-point number (delay/reverb time, pre-delay). */
const boundedNumber = (ref: ParamRef): z.ZodNumber => applyCatalog(z.number(), ref);

/** A catalog-bounded integer, `.int()` applied before the bounds so both survive to JSON schema. */
const boundedInt = (ref: ParamRef): z.ZodNumber => applyCatalog(z.number().int(), ref);

export { boundedNumber, boundedInt, boundsFor, paramFor, describeParam, refLabel };
export type { ParamRef };
