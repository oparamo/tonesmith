interface Patch {
  name: string;
}

interface PatchFile<T extends Patch = Patch> {
  name: string;
  device: string;
  patches: T[];
}

type RawPatch = Record<string, unknown>;

export type { Patch, PatchFile, RawPatch };
