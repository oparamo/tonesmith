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

/**
 * Marks a patch that has been through `presentPatch`. Declared rather than defined: nothing carries
 * it at runtime, and its whole job is to make a view and a patch different types.
 */
declare const PRESENTED: unique symbol;

/**
 * A decoded patch prepared for a consumer to read, shaped like the patch it came from but missing
 * the selector copy `presentPatch` drops. `PatchDriver.encodePatch` refuses it, since it reads that
 * copy to pick a block's field map and would otherwise write the block's old sub-model byte back
 * and report the write as done.
 */
type PatchView<T> = T & { readonly [PRESENTED]: true };

/** A patch the encoder will take, which is any patch that is not a `PatchView`. */
type Encodable<T> = T & { readonly [PRESENTED]?: never };

export type { Patch, PatchFile, RawPatch, PatchView, Encodable };
