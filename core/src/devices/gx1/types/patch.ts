import type { Patch as BasePatch, PatchFile as BasePatchFile } from "../../../types";
import type { RAW } from "../common";
import type { RawParamSet, TslEnvelope } from "./tsl";
import type {
  FxBlock, DriveBlock, AmpBlock, NoiseGateBlock, VolumeBlock, DelayBlock, ReverbBlock, PedalFxBlock,
} from "./blocks";

/**
 * The settings the patch itself carries rather than any block: what the whole patch is trimmed to,
 * the tempo its note-valued controls resolve against, the key its harmonies are calculated in, and
 * what survives a patch change. They sit at the top level beside `name` because that is where the
 * device keeps them, in a block of its own that no effect reads.
 */
interface PatchSettings {
  /** Output trim for the whole patch, 0-200 with 100 as unity. */
  memoryLevel: number;
  /** Reference tempo, 40-250. Every control set to a note value plays against this. */
  bpm: number;
  key: string;
  /** Whether the current sound keeps ringing through a patch change. */
  carryover: boolean;
  /** Whether `bpm` survives a patch change instead of the next patch's own taking over. */
  tempoHold: boolean;
}

interface Patch extends BasePatch, PatchSettings {
  memo: string;
  chain: string[];
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

export type { Patch, PatchFile, PatchSettings };
