import type { Patch as BasePatch, PatchFile as BasePatchFile } from "../../../types";
import type { RAW } from "../common";
import type { RawParamSet, TslEnvelope } from "./tsl";
import type { FxBlock, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock } from "./blocks";

interface Patch extends BasePatch {
  memo: string;
  chain: string[];
  fx1: FxBlock;
  fx2: FxBlock;
  fx3: FxBlock;
  odds: OdDsBlock;
  amp: AmpBlock;
  ns: NsBlock;
  fv: FvBlock;
  delay: DelayBlock;
  reverb: ReverbBlock;
  [RAW]: RawParamSet;
}

interface PatchFile extends BasePatchFile<Patch> {
  formatRev: string;
  [RAW]: TslEnvelope;
}

export type { Patch, PatchFile };
