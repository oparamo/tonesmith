interface Patch {
  name: string;
  /**
   * The block order this patch stores. Every device declares a chain in its capabilities, but only
   * one whose chain a patch can rearrange carries the resulting order here, which is why it is
   * optional rather than part of the contract.
   */
  chain?: string[];
}

interface PatchFile<T extends Patch = Patch> {
  name: string;
  device: string;
  patches: T[];
}

type RawPatch = Record<string, unknown>;

export type { Patch, PatchFile, RawPatch };
