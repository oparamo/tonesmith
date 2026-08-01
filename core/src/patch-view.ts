/**
 * A decoded block whose model selector is stored in `params.type` but also mirrored onto
 * `subType` at decode time, so both carry the identical value.
 */
interface MirrorBlock { subType: string; params: Record<string, unknown> }

const isMirrorBlock = (value: unknown): value is MirrorBlock => {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  if (typeof block.subType !== "string" || !block.subType) return false;
  const params = block.params;
  if (typeof params !== "object" || params === null) return false;
  return (params as Record<string, unknown>).type === block.subType;
};

/**
 * Consumer-facing view of a decoded patch: drops the redundant `params.type` from every block
 * that mirrors it onto `subType`. The model selector is stored in `params.type` and surfaced as
 * `subType`, so emitting both would leave a consumer guessing which one to set. Keys on the
 * mirror relationship itself rather than on any device's block names. Returns a shallow copy.
 */
const presentPatch = <T extends object>(patch: T): T => {
  const view: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  for (const [key, block] of Object.entries(view)) {
    if (!isMirrorBlock(block)) continue;
    const params = { ...block.params };
    delete params.type;
    view[key] = { ...block, params };
  }
  return view as T;
};

export { presentPatch };
