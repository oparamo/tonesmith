import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";
import type { ParamSpec } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/**
 * Points at one param in the gx1 capability catalog, for the hand-written fields of the blocks
 * whose params don't vary by type (amp/odds/ns/fv). A per-type block reads its params through
 * `variantField` instead, which takes the ParamSpec itself. `note` carries builder behavior the
 * catalog has no opinion on, such as what an omitted field defaults to.
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
 * Applies bounds and a description to a `z.number()` base. Bounds land after the base rather than
 * before it: zod v4 lets a trailing `.int()` clobber earlier min/max in the emitted JSON schema, so
 * `.int()` has to be on the base already (see `boundedInt` and `spanningInt`).
 */
const applyBounds = (base: z.ZodNumber, bounds: { min: number; max: number }, description: string): z.ZodNumber =>
  base.min(bounds.min).max(bounds.max).describe(description);

/** A catalog-bounded integer, `.int()` applied before the bounds so both survive to JSON schema. */
const boundedInt = (ref: ParamRef): z.ZodNumber =>
  applyBounds(z.number().int(), boundsFor(ref), describeParam(ref));

/**
 * The device's own label for a param, stated only where the property key doesn't already spell it.
 * `preDelay` needs no gloss for PRE-DELAY, but nothing in `spreadTime` says the device calls that
 * knob S-TIME, and the parameter guide an agent may have read uses the label.
 */
const labelGloss = (spec: ParamSpec): string | undefined => {
  const normalize = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (spec.key === undefined || normalize(spec.name) === normalize(spec.key)) return undefined;
  return spec.name;
};

/**
 * The catalog's range string, stated only where it says more than `minimum`/`maximum` already do.
 * That is the unit and the BPM option: 1-2000 reads as milliseconds only once something says so,
 * while a bare 0-100 needs no gloss at all.
 */
const rangeGloss = (spec: ParamSpec): string | undefined => {
  if (spec.min === undefined || spec.max === undefined) return undefined;
  // The catalog signs the upper bound of a range that crosses zero ("-50-+50"), so the comparison
  // has to sign it too or every bipolar param keeps a description restating its own bounds.
  const bounds = spec.min < 0 && spec.max > 0 ? `${spec.min}-+${spec.max}` : `${spec.min}-${spec.max}`;
  if (spec.range === bounds) return undefined;
  return spec.range;
};

/**
 * What a per-type variant says about a param, beyond the bounds it declares.
 *
 * Kept to the unit and the device's own label, both of which the schema can't express otherwise.
 * The full sentence stays in describe_device: prose here is serialized into every variant of every
 * request, and the same param is declared by as many as nine types.
 */
const variantDescription = (spec: ParamSpec): string | undefined => {
  const parts = [labelGloss(spec), rangeGloss(spec)].filter(part => part !== undefined);
  if (parts.length === 0) return undefined;
  return parts.join(" ");
};

/**
 * The schema for one catalog param, built from that param's own domain.
 *
 * `boolean` and `values` identify the non-numeric kinds; a numeric param takes `.int()` unless the
 * catalog gave it `decimals`, since its bounds alone can't say whether 4.5 is legal (reverb TIME
 * runs 0.1-10.0 but PRE-DELAY's 0-200 is whole milliseconds).
 */
const buildParamField = (spec: ParamSpec): z.ZodType => {
  if (spec.boolean === true) return z.boolean();
  if (spec.values !== undefined) return z.enum([...spec.values]);
  if (spec.min === undefined || spec.max === undefined) return z.string();
  const base = spec.decimals === undefined ? z.number().int() : z.number();
  return base.min(spec.min).max(spec.max);
};

/**
 * What makes two params the same field. Identical params are authored once in the catalog and
 * copied per type (`DLY_TIME` serves nine delay types), but each type's copy is a fresh object, so
 * only a value signature lets the schemas below be shared instances. That sharing is what lets zod
 * emit one `$defs` entry per distinct field rather than repeating it in every variant.
 */
const fieldSignature = (spec: ParamSpec): string =>
  JSON.stringify([spec.key, spec.min, spec.max, spec.decimals, spec.boolean, spec.values, variantDescription(spec)]);

const fieldsBySignature = new Map<string, z.ZodType>();

/**
 * A catalog param as one field of a per-type variant, shared with every type declaring the same
 * param. Always optional: an unset param takes the chosen type's factory default.
 */
const variantField = (spec: ParamSpec): z.ZodType => {
  const signature = fieldSignature(spec);
  const shared = fieldsBySignature.get(signature);
  if (shared !== undefined) return shared;

  const description = variantDescription(spec);
  const base = buildParamField(spec);
  const described = description === undefined ? base : base.describe(description);

  const field = described.optional();
  fieldsBySignature.set(signature, field);
  return field;
};

export { boundedInt, boundsFor, paramFor, describeParam, refLabel, variantField };
export type { ParamRef };
