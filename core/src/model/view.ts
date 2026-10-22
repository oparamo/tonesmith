import type { FieldValue } from "./patch";

/** One patch-level fact worth reading above the blocks, in the words the device stores it under. */
interface PatchDetail {
  label: string;
  value: string;
}

/** One block of a patch, labeled and ordered by the driver, in the shape a renderer walks. */
interface BlockView {
  /** What the device's own panel calls this block. */
  label: string;
  /** The block's key in a spec and in a dot-path edit, which an abbreviated label rarely gives away. */
  key: string;
  /** Absent on a block the device cannot bypass. */
  on?: boolean;
  /** Absent on a block with nothing to select between, as on the decoded block itself. */
  type?: string;
  subType?: string | null;
  params: Record<string, FieldValue>;
}

/**
 * A patch as a person reads it. What a patch carries beside its blocks, what each block is called,
 * and which order they belong in are all device knowledge, so the driver composes this and whoever
 * renders it needs to know nothing about the device.
 */
interface PatchView {
  name: string;
  details: PatchDetail[];
  blocks: BlockView[];
}

export type { PatchDetail, BlockView, PatchView };
