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
  decodePatch(raw: RawPatch): T;
  encodePatch(patch: T): RawPatch;
}

export type { PatchDriver };
