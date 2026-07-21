/**
 * A decoded block whose model selector is stored in `params.type` but also mirrored onto
 * `subType` at decode time, so both carry the identical value.
 */
interface MirrorBlock { subType: string; params: Record<string, unknown> }

/** True when `value` is a block that mirrors its `params.type` onto `subType` (same value). */
const isMirrorBlock = (value: unknown): value is MirrorBlock => {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  if (typeof block.subType !== "string" || !block.subType) return false;
  const params = block.params;
  if (typeof params !== "object" || params === null) return false;
  return (params as Record<string, unknown>).type === block.subType;
};

/**
 * Produces an agent-facing view of a decoded patch for serialization: drops the redundant
 * `params.type` from every block that mirrors it onto `subType`. The model selector lives in
 * `params.type` internally (canonical storage) and is surfaced as `subType` for display, so
 * emitting both just confuses a consumer about which to set. Device-agnostic — it keys on the
 * mirror relationship itself, never on any device's block names. Returns a shallow copy; the
 * input patch is left untouched.
 */
const presentPatch = (patch: object): Record<string, unknown> => {
  const view: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  for (const [key, block] of Object.entries(view)) {
    if (!isMirrorBlock(block)) continue;
    const params = { ...block.params };
    delete params.type;
    view[key] = { ...block, params };
  }
  return view;
};

export { presentPatch };
