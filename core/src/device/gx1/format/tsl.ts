import { decodePatch, encodePatch } from "./codec";
import { encodeName } from "./codec/blocks";
import { RAW } from "../model";
import { FACTORY_BLOCKS } from "./factoryPatch";
import type { PatchFile as BasePatchFile } from "../../../model";
import type { Patch, PatchFile, RawParamSet, TslEnvelope } from "../model";

/** The block holding the patch name, which the factory blocks leave to each blank patch. */
const NAME_BLOCK = "MEMORY%COM";

/** A fresh param set per call: RAW is a public escape hatch, and a caller may mutate a block in place. */
const blankParamSet = (): RawParamSet =>
  Object.fromEntries(
    Object.entries(FACTORY_BLOCKS).map(([block, hex]) => [block, hex.match(/../g) ?? []])
  );

/**
 * The device's factory-default patch under a new name. Every block opens off, at the device's own
 * values, which is what a block left out of a spec keeps and what switching it on later starts from.
 */
const blankPatch = (name = "NEW PATCH"): Patch => {
  const paramSet = { [NAME_BLOCK]: encodeName(name), ...blankParamSet() };
  return decodePatch({ memo: "", paramSet });
};

/** The `device` field of the file format itself: what this driver writes, and the only one it reads. */
const FILE_DEVICE = "GX-1";

/** This driver's id in the registry, which is what a decoded file names as its device. */
const DRIVER_ID = "gx1";

const FORMAT_REV = "0000";

const newFile = (setName: string, patchCount = 1): PatchFile => {
  const patches = Array.from({ length: patchCount }, () => blankPatch());
  const envelope: TslEnvelope = { name: setName, formatRev: FORMAT_REV, device: FILE_DEVICE, data: [[], []] };
  return { name: setName, formatRev: FORMAT_REV, device: DRIVER_ID, patches, [RAW]: envelope };
};

/** Every block a patch has to carry: the name block, and every block the factory patch holds. */
const REQUIRED_BLOCKS = [NAME_BLOCK, ...Object.keys(FACTORY_BLOCKS)];

const isHexList = (value: unknown): boolean =>
  Array.isArray(value) && value.every(entry => typeof entry === "string");

const paramSetOf = (patch: unknown): Record<string, unknown> | undefined => {
  if (patch === null || typeof patch !== "object") return undefined;
  const { paramSet } = patch as { paramSet?: unknown };
  if (paramSet === null || typeof paramSet !== "object") return undefined;
  return paramSet as Record<string, unknown>;
};

const checkPatch = (source: string, index: number, patch: unknown): void => {
  const paramSet = paramSetOf(patch);
  if (paramSet === undefined) {
    throw new Error(`Cannot read ${source}: patch ${index} carries no paramSet.`);
  }
  const missing = REQUIRED_BLOCKS.filter(block => !isHexList(paramSet[block]));
  if (missing.length > 0) {
    throw new Error(`Cannot read ${source}: patch ${index} is missing ${missing.join(", ")}.`);
  }
};

/**
 * Narrows what `JSON.parse` handed back to an envelope this device wrote. Anything at all can be
 * pointed at a tool that takes a path, and without this the first field the codec reaches for
 * throws a TypeError naming neither the file nor what is wrong with it.
 */
const parseEnvelope = (source: string, parsed: unknown): TslEnvelope => {
  const envelope = (parsed ?? {}) as Partial<TslEnvelope>;
  if (typeof envelope !== "object" || typeof envelope.device !== "string") {
    throw new Error(`Cannot read ${source}: it is not a patch file.`);
  }
  if (envelope.device !== FILE_DEVICE) {
    throw new Error(`Cannot read ${source}: it holds a ${envelope.device} patch set, not a ${FILE_DEVICE} one.`);
  }
  if (!Array.isArray(envelope.data) || !Array.isArray(envelope.data[0])) {
    throw new Error(`Cannot read ${source}: its "data" field holds no list of patches.`);
  }
  envelope.data[0].forEach((patch, index) => { checkPatch(source, index, patch); });
  return envelope as TslEnvelope;
};

const parseFile = (bytes: Uint8Array, source: string): PatchFile => {
  const envelope = parseEnvelope(source, JSON.parse(new TextDecoder().decode(bytes)));
  return {
    name:      envelope.name,
    formatRev: envelope.formatRev,
    device:    DRIVER_ID,
    patches:   envelope.data[0].map(decodePatch),
    [RAW]: envelope,
  };
};

/**
 * The device-agnostic `PatchFile` a caller may hand `PatchDriver.serializeFile` is not one this
 * writer can start from. Every write begins at the envelope the file was parsed from and overwrites
 * the byte indices this codec knows, which is what leaves the format's undecoded fields intact, so a
 * file assembled by hand has nothing to write back.
 */
const asWritable = (file: BasePatchFile<Patch>): PatchFile => {
  const candidate = file as Partial<PatchFile>;
  if (candidate[RAW] === undefined || candidate.formatRev === undefined) {
    throw new Error("Cannot write this patch file: it did not come from parseFile or newFile, so it carries none of the original bytes a write starts from.");
  }
  return file as PatchFile;
};

const serializeFile = (input: BasePatchFile<Patch>): Uint8Array => {
  const file = asWritable(input);
  const envelope: TslEnvelope = {
    ...file[RAW],
    name:      file.name,
    formatRev: file.formatRev,
    data: [file.patches.map(encodePatch), file[RAW].data[1]],
  };
  return new TextEncoder().encode(JSON.stringify(envelope));
};

export { DRIVER_ID, blankPatch, newFile, parseFile, serializeFile };
