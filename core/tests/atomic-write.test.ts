import { describe, it, expect } from "vitest";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../src/atomic-write";
import { scratchDir } from "./helpers";

describe("writeFileAtomic", () => {
  const scratch = scratchDir();

  it("writes the contents, creating any missing parent directories", async () => {
    const path = join(scratch(), "nested", "deeper", "set.tsl");

    await writeFileAtomic(path, new TextEncoder().encode("contents"));

    expect(await readFile(path, "utf8")).toBe("contents");
  });

  it("replaces an existing file and leaves no temporary file behind", async () => {
    const root = scratch();
    const path = join(root, "set.tsl");
    await writeFile(path, "old");

    await writeFileAtomic(path, new TextEncoder().encode("new"));

    expect(await readFile(path, "utf8")).toBe("new");
    expect(await readdir(root)).toEqual(["set.tsl"]);
  });

  // The point of the sibling file: the target is never opened for writing, so a write that cannot
  // finish leaves the library as it was rather than truncated to nothing.
  it("leaves the target alone and cleans up when the write cannot complete", async () => {
    const root = scratch();
    const path = join(root, "set.tsl");
    await writeFile(path, "the library");
    const blocked = join(root, "blocked");
    await mkdir(blocked);

    const writeOverADirectory = writeFileAtomic(blocked, new TextEncoder().encode("contents"));

    await expect(writeOverADirectory).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("the library");
    expect((await readdir(root)).sort()).toEqual(["blocked", "set.tsl"]);
  });
});
