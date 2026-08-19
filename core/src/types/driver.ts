import type { Patch, PatchFile, RawPatch } from "./patch";
import type { DeviceCapabilities } from "./capabilities";

/** Dot-path to the value written there, as `write_fields` and the CLI's `write` both express it. */
type FieldEdits = Record<string, unknown>;

interface PatchDriver<T extends Patch = Patch> {
  readonly id: string;
  readonly name: string;
  readonly capabilities: DeviceCapabilities;
  readFile(path: string): PatchFile<T>;
  writeFile(file: PatchFile<T>, path: string): void;
  newFile(setName: string, nPatches?: number): PatchFile<T>;
  blankPatch(name?: string): T;
  /**
   * Builds a patch from a plain spec object, validated against this device's own capability
   * catalog. Takes `unknown` because the spec's shape is device knowledge: a caller that could
   * type it would already have to know the device, which is what this method exists to avoid.
   */
  buildPatch(spec: unknown): T;
  /**
   * Every problem with a set of dot-path edits already applied to `patch`, checked against this
   * device's capability catalog; empty when they are all usable. Reading the selection off the
   * patch rather than off the edits is what lets an edit changing a block's type and an edit
   * setting a param of that new type validate as one consistent state.
   *
   * `setByPath` establishes only that a field exists, which is why this is separate: a real field
   * handed a value of the wrong kind or outside the param's range still encodes to a byte the
   * device cannot mean.
   */
  validateFields(patch: T, edits: FieldEdits): string[];
  decodePatch(raw: RawPatch): T;
  encodePatch(patch: T): RawPatch;
}

export type { FieldEdits, PatchDriver };
