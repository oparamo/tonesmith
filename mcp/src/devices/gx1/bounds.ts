import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/** Looks up a param's ParamSpec, from a group's shared params or a per-type item's params. */
const paramFor = (groupId: string, paramName: string, typeId?: string): { min?: number; max?: number } => {
  const group = capabilityUtils.findGroup(capabilities, groupId);
  const params = typeId === undefined ? group.params : capabilityUtils.findItem(group, typeId).params;
  const param = params?.find(spec => spec.name === paramName);
  const where = typeId === undefined ? `group "${groupId}"` : `${groupId} type "${typeId}"`;
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities ${where}`);
  return param;
};

/**
 * The catalog-declared numeric `min`/`max` for a param — read straight off the ParamSpec (the
 * catalog derives them from each param's structured domain), so the schema never restates and
 * can't drift from the device range. Throws if the param isn't numeric (an enum has no bounds) —
 * a mis-mapped field fails loudly at load rather than yielding a silently unbounded number.
 */
const boundsFor = (groupId: string, paramName: string, typeId?: string): { min: number; max: number } => {
  const param = paramFor(groupId, paramName, typeId);
  if (param.min === undefined || param.max === undefined) {
    const where = typeId === undefined ? `group "${groupId}"` : `${groupId} type "${typeId}"`;
    throw new Error(`ParamSpec "${paramName}" in ${where} has no numeric bounds`);
  }
  return { min: param.min, max: param.max };
};

/**
 * Applies the catalog's min/max for a param to a `z.number()` base. `typeId` picks the
 * representative type for per-type blocks (delay/reverb) whose flat schema field can't express
 * per-type ranges; omit it for single-shape blocks (amp/odds/ns/fv). Bounds are applied last: zod
 * v4 lets a trailing `.int()` clobber earlier min/max in the emitted JSON schema, so `.int()` must
 * be on the base before the bounds land (see `boundedInt`).
 */
const applyBounds = (base: z.ZodNumber, groupId: string, paramName: string, typeId?: string): z.ZodNumber => {
  const { min, max } = boundsFor(groupId, paramName, typeId);
  return base.min(min).max(max);
};

/** A catalog-bounded floating-point number (delay/reverb time, pre-delay). */
const boundedNumber = (groupId: string, paramName: string, typeId?: string): z.ZodNumber =>
  applyBounds(z.number(), groupId, paramName, typeId);

/** A catalog-bounded integer — `.int()` applied before the bounds so both survive to JSON schema. */
const boundedInt = (groupId: string, paramName: string, typeId?: string): z.ZodNumber =>
  applyBounds(z.number().int(), groupId, paramName, typeId);

export { boundedNumber, boundedInt, boundsFor };
