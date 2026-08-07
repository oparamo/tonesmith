import type { Patch, PatchFile, RawPatch } from "./patch";
import type { DeviceCapabilities } from "./capabilities";

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
  decodePatch(raw: RawPatch): T;
  encodePatch(patch: T): RawPatch;
}

export type { PatchDriver };
