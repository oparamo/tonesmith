import type { FieldValue, Patch, PatchFile, RawPatch } from "./patch";
import type { DeviceCapabilities } from "./capabilities";
import type { PatchView } from "./view";

/** One requested edit: a dot-path, and the value to write there. */
type FieldEdit = readonly [path: string, value: FieldValue];

/** What a batch of edits wrote, keyed by the path that wrote it. */
type FieldEdits = Record<string, FieldValue>;

interface PatchDriver<T extends Patch = Patch> {
  readonly id: string;
  readonly name: string;
  readonly capabilities: DeviceCapabilities;
  /**
   * Decodes a patch file's bytes. `source` names where they came from, for error messages only.
   * Drivers never touch the filesystem: core's `patchUtils` reads and writes every file, which is
   * what lets it serialize a read-change-write on one file as a unit.
   */
  parseFile(bytes: Uint8Array, source: string): PatchFile<T>;
  /** Encodes a patch file to the bytes the device's format stores it as. */
  serializeFile(file: PatchFile<T>): Uint8Array;
  newFile(setName: string, nPatches?: number): PatchFile<T>;
  blankPatch(name?: string): T;
  /**
   * Builds a patch from a plain spec object, validated against this device's own capability
   * catalog. Takes `unknown` because the spec's shape is device knowledge: a caller that could
   * type it would already have to know the device, which is what this method exists to avoid.
   * Returns the patch as a file will store it, so what a caller sees is what reading it back gives.
   */
  buildPatch(spec: unknown): T;
  /**
   * Applies dot-path edits to `patch` in place, in the order given, and returns what each one
   * actually wrote so a caller can report the values without re-deriving them. Throws naming every
   * problem at once: a path the device has no field for, and a field handed a value outside what
   * its param accepts, are the same kind of answer to the caller and arrive together.
   *
   * What a path means is the device's own knowledge, which is why resolving one is the driver's
   * job rather than a walk over the decoded object from outside. A rejection leaves the patch
   * partly edited, so a caller writes the file only once this returns.
   */
  applyEdits(patch: T, edits: readonly FieldEdit[]): FieldEdits;
  /**
   * The patch as a person reads it: the device's own block labels, in the order this patch runs
   * them, with whatever the device stores about the patch itself. Grouping, ordering and labels
   * stay the driver's, so displaying a device that ships later costs nothing outside its driver.
   */
  viewPatch(patch: T): PatchView;
  decodePatch(raw: RawPatch): T;
  encodePatch(patch: T): RawPatch;
}

export type { FieldEdit, FieldEdits, PatchDriver };
