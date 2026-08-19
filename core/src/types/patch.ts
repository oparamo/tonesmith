/** What one control can be set to, and equally what a field edit can set it to. */
type FieldValue = string | number | boolean;

/**
 * One block of a patch, in the shape every device presents and every device accepts. A block's own
 * selectors are the only keys beside `params`, so a device's controls keep whatever names its panel
 * prints, `type` among them, with nothing they can collide with.
 */
interface PatchBlock {
  /** Absent on a block the device cannot bypass. */
  on?: boolean;
  /** Absent on a block with nothing to select between. */
  type?: string;
  /** The model within a type, and null on a type that offers none. */
  subType?: string | null;
  params: Record<string, FieldValue>;
}

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

export type { FieldValue, PatchBlock, Patch, PatchFile, RawPatch };
