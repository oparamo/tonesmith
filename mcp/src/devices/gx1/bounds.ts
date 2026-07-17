import { z } from "zod";
import { gx1, capabilityUtils } from "@tonesmith/core";

const capabilities = gx1.driver.capabilities;

/**
 * Extracts the leading numeric `[min, max]` pair from a `ParamSpec.range` string.
 * Ranges are free text carrying units/suffixes ("1-2000 ms, BPM", "0.1-10.0 s") and
 * signed bounds ("-50-+50"); only the numeric endpoints are taken, the rest is ignored.
 * Throws if the range isn't a numeric min-max pair (e.g. an enum list like "LPF, BPF, HPF") —
 * that's a mis-mapped field, and failing loudly at load beats a silently unbounded number.
 */
const parseNumericRange = (range: string): { min: number; max: number } => {
  const match = /(-?\d+(?:\.\d+)?)-\+?(-?\d+(?:\.\d+)?)/.exec(range);
  if (!match) throw new Error(`Range "${range}" is not a numeric min-max range`);
  return { min: Number(match[1]), max: Number(match[2]) };
};

/** Looks up a param's range string, from a group's shared params or a per-type item's params. */
const rangeFor = (groupId: string, paramName: string, typeId?: string): string => {
  const group = capabilityUtils.findGroup(capabilities, groupId);
  const params = typeId === undefined ? group.params : capabilityUtils.findItem(group, typeId).params;
  const param = params?.find(spec => spec.name === paramName);
  const where = typeId === undefined ? `group "${groupId}"` : `${groupId} type "${typeId}"`;
  if (!param) throw new Error(`No ParamSpec "${paramName}" in capabilities ${where}`);
  return param.range;
};

/**
 * Applies the catalog-derived min/max for a param to a `z.number()` base, so the tool schema
 * never restates — and can't drift from — the device range. `typeId` picks the representative
 * type for per-type blocks (delay/reverb) whose flat schema field can't express per-type ranges;
 * omit it for single-shape blocks (amp/odds/ns/fv). Bounds are applied last: zod v4 lets a
 * trailing `.int()` clobber earlier min/max in the emitted JSON schema, so `.int()` must be on
 * the base before the bounds land (see `boundedInt`).
 */
const applyBounds = (base: z.ZodNumber, groupId: string, paramName: string, typeId?: string): z.ZodNumber => {
  const { min, max } = parseNumericRange(rangeFor(groupId, paramName, typeId));
  return base.min(min).max(max);
};

/** A catalog-bounded floating-point number (delay/reverb time, pre-delay). */
const boundedNumber = (groupId: string, paramName: string, typeId?: string): z.ZodNumber =>
  applyBounds(z.number(), groupId, paramName, typeId);

/** A catalog-bounded integer — `.int()` applied before the bounds so both survive to JSON schema. */
const boundedInt = (groupId: string, paramName: string, typeId?: string): z.ZodNumber =>
  applyBounds(z.number().int(), groupId, paramName, typeId);

export { boundedNumber, boundedInt, parseNumericRange, rangeFor };
