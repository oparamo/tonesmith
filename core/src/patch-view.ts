/**
 * A decoded block whose sub-model selection lives inside its params bag and is also mirrored onto
 * the block's own `subType`, so both carry the identical value under the identical name.
 */
interface MirrorBlock { subType: string; params: Record<string, unknown> }

const isMirrorBlock = (value: unknown): value is MirrorBlock => {
  if (typeof value !== "object" || value === null) return false;
  const block = value as Record<string, unknown>;
  if (typeof block.subType !== "string" || !block.subType) return false;
  const params = block.params;
  if (typeof params !== "object" || params === null) return false;
  return (params as Record<string, unknown>).subType === block.subType;
};

/**
 * Consumer-facing view of a decoded patch: drops the duplicate `subType` from inside the params
 * bag of every block that mirrors it onto the block itself. A device is free to store the
 * selection among the params, but emitting it twice leaves a consumer guessing which copy to set.
 * Keys on the mirror relationship itself rather than on any device's block names. Returns a
 * shallow copy.
 */
const presentPatch = <T extends object>(patch: T): T => {
  const view: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
  for (const [key, block] of Object.entries(view)) {
    if (!isMirrorBlock(block)) continue;
    const params = { ...block.params };
    delete params.subType;
    view[key] = { ...block, params };
  }
  return view as T;
};

export { presentPatch };
