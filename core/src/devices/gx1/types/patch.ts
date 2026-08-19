import type { Patch as BasePatch, PatchFile as BasePatchFile } from "../../../types";
import type { RAW } from "../common";
import type { RawParamSet, TslEnvelope } from "./tsl";
import type {
  FxBlock, DriveBlock, AmpBlock, NoiseGateBlock, VolumeBlock, DelayBlock, ReverbBlock, PedalFxBlock,
} from "./blocks";

interface Patch extends BasePatch {
  memo: string;
  chain: string[];
  key: string;
  fx1: FxBlock;
  fx2: FxBlock;
  fx3: FxBlock;
  drive: DriveBlock;
  amp: AmpBlock;
  noiseGate: NoiseGateBlock;
  volume: VolumeBlock;
  pedalFx: PedalFxBlock;
  delay: DelayBlock;
  reverb: ReverbBlock;
  [RAW]: RawParamSet;
}

interface PatchFile extends BasePatchFile<Patch> {
  formatRev: string;
  [RAW]: TslEnvelope;
}

export type { Patch, PatchFile };
