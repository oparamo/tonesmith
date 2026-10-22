import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes a file by filling a sibling first and renaming it over the target, so the file at `path`
 * is either the old one or the new one and never a partial one. Writing in place truncates the
 * target before the first byte lands, which turns a full disk, an interrupted process or anything
 * throwing partway into an emptied patch library. The rename is atomic because the sibling shares
 * the target's directory, and therefore its filesystem.
 */
const writeFileAtomic = async (path: string, contents: Uint8Array): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  // The pid keeps two processes writing the same target off each other's temporary file, and the
  // UUID does the same for two writes overlapping within one process.
  const pending = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(pending, contents);
    await rename(pending, path);
  } catch (error) {
    await rm(pending, { force: true });
    throw error;
  }
};

export { writeFileAtomic };
