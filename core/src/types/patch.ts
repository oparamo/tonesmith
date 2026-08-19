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
  /** The patch set's own name, which is not the filename it is stored under. */
  name: string;
  /**
   * The id of the driver this file belongs to, as `registry.getDriver` takes it, so a consumer
   * holding a file can find the driver that reads it. Whatever the format calls the device is a
   * fact about the file rather than about the driver, and stays in the file's own raw envelope.
   */
  device: string;
  patches: T[];
}

type RawPatch = Record<string, unknown>;

export type { Patch, PatchFile, RawPatch };
