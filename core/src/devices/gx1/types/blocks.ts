import type { RAW } from "../common/index.js";
import type { FxParams } from "./tsl.js";

interface FxBlock {
  on: boolean;
  type: string;
  subtype: string | null;
  params: FxParams;
  [RAW]: number[];
}

interface OdDsBlock {
  on: boolean;
  type: string;
  drive: number;
  tone: number;
  level: number;
  direct: number;
  [RAW]: number[];
}

interface AmpBlock {
  on: boolean;
  type: string;
  gain: number;
  level: number;
  bass: number;
  middle: number;
  treble: number;
  speaker: string;
  mic: string;
  [RAW]: number[];
}

interface NsBlock {
  on: boolean;
  threshold: number;
  release: number;
  detect: string;
  [RAW]: number[];
}

interface FvBlock {
  position: number;
  min: number;
  max: number;
  curve: string;
  [RAW]: number[];
}

// DelayBlock and ReverbBlock carry type-specific extra fields at the same level,
// so they extend Record<string, unknown> to permit them while remaining typed for
// the known base fields.
interface DelayBlock extends Record<string, unknown> {
  on: boolean;
  type: string;
  [RAW]: number[];
}

interface ReverbBlock extends Record<string, unknown> {
  on: boolean;
  type: string;
  [RAW]: number[];
}

export type { FxBlock, OdDsBlock, AmpBlock, NsBlock, FvBlock, DelayBlock, ReverbBlock };
