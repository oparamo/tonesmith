import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Writes a file by filling a sibling first and renaming it over the target, so the file at `path`
 * is either the old one or the new one and never a partial one. Writing in place truncates the
 * target before the first byte lands, which turns a full disk, an interrupted process or anything
 * throwing partway into an emptied patch library. The rename is atomic because the sibling shares
 * the target's directory, and therefore its filesystem.
 *
 * Every driver's `writeFile` should go through this rather than `writeFileSync`: the file it is
 * overwriting is the user's own library.
 */
const writeFileAtomic = (path: string, contents: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  // The pid keeps two processes writing the same target off each other's temporary file. Within one
  // process there is nothing to separate: both calls here are synchronous, so writes cannot overlap.
  const pending = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(pending, contents);
    renameSync(pending, path);
  } catch (error) {
    rmSync(pending, { force: true });
    throw error;
  }
};

export { writeFileAtomic };
