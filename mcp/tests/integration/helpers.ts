import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gx1, patchService } from "@tonesmith/core";
import { present } from "../helpers";

const FIXTURE = join(import.meta.dirname, "../../../fixtures/gx1/rock-tones.tsl");

/** A scratch dir with the rock-tones fixture copied in, for tools that write files. */
const withTempDir = async (): Promise<{ dir: string; fixture: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-mcp-"));
  const fixture = join(dir, "rock-tones.tsl");
  await copyFile(FIXTURE, fixture);
  return { dir, fixture, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

/** The patch at `index` of the file at `path`, read back through the gx1 driver. */
const patchAt = async (path: string, index = 0): Promise<gx1.Patch> => {
  const file = await patchService.readPatchFile(gx1.driver, path);
  return present(file.patches[index], `patch ${index} of ${path}`);
};

export { FIXTURE, withTempDir, patchAt };
