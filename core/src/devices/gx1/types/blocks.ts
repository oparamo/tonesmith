import type { PatchBlock } from "../../../types";
import type { RAW } from "../common";
import type { BlockParams } from "./tsl";

/**
 * Every block keeps its controls in `params`, which is the shape `PatchBlock` fixes for every
 * device. The blocks below add only what this device stores: the raw bytes under `RAW`, and a
 * narrower params type where the control set is fixed rather than chosen by `type`.
 */

interface FxBlock extends PatchBlock {
  on: boolean;
  type: string;
  subType: string | null;
  params: BlockParams;
  [RAW]: number[];
}

interface DriveParams extends BlockParams {
  drive: number;
  tone: number;
  level: number;
  direct: number;
  solo: boolean;
  soloLevel: number;
}

/** The dedicated overdrive/distortion block, which the GX-1's own panel labels OD/DS. */
interface DriveBlock extends PatchBlock {
  on: boolean;
  type: string;
  params: DriveParams;
  [RAW]: number[];
}

interface AmpParams extends BlockParams {
  gain: number;
  level: number;
  bass: number;
  middle: number;
  treble: number;
  speaker: string;
  mic: string;
  solo: boolean;
  soloLevel: number;
}

interface AmpBlock extends PatchBlock {
  on: boolean;
  type: string;
  params: AmpParams;
  [RAW]: number[];
}

interface NoiseGateParams extends BlockParams {
  threshold: number;
  release: number;
  detect: string;
}

/** The noise gate, which the GX-1's own panel labels NS. */
interface NoiseGateBlock extends PatchBlock {
  on: boolean;
  params: NoiseGateParams;
  [RAW]: number[];
}

interface VolumeParams extends BlockParams {
  position: number;
  min: number;
  max: number;
  curve: string;
}

/**
 * The volume block, which the GX-1's own panel labels FV (Foot Volume). It is normally driven by an
 * expression pedal but not only by one, and its position is stored in the patch either way, so it
 * is always in the chain and has no `on`.
 */
interface VolumeBlock extends PatchBlock {
  params: VolumeParams;
  [RAW]: number[];
}

interface DelayBlock extends PatchBlock {
  on: boolean;
  type: string;
  params: BlockParams;
  [RAW]: number[];
}

interface ReverbBlock extends PatchBlock {
  on: boolean;
  type: string;
  params: BlockParams;
  [RAW]: number[];
}

/** The effect assigned to the expression pedal input, which the GX-1's own panel labels PFX. */
interface PedalFxBlock extends PatchBlock {
  on: boolean;
  type: string;
  subType: string | null;
  params: BlockParams;
  [RAW]: number[];
}

export type {
  FxBlock, DriveBlock, DriveParams, AmpBlock, AmpParams, NoiseGateBlock, NoiseGateParams,
  VolumeBlock, VolumeParams, DelayBlock, ReverbBlock, PedalFxBlock,
};
