import { describe, it, expect } from "vitest";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomic } from "../../src/persistence/atomicWrite";
import { scratchDir } from "../helpers";

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
    expect(await readdir(root)).toStrictEqual(["set.tsl"]);
  });

  // The target is never opened for writing directly, so a write that cannot finish leaves it as it
  // was and leaves no temporary file sitting next to it.
  it("leaves the target alone and cleans up when the write cannot complete", async () => {
    const root = scratch();
    const blocked = join(root, "blocked");
    await mkdir(blocked);

    const writeOverADirectory = writeFileAtomic(blocked, new TextEncoder().encode("contents"));

    await expect(writeOverADirectory).rejects.toThrow();
    expect((await stat(blocked)).isDirectory()).toBe(true);
    expect(await readdir(root)).toStrictEqual(["blocked"]);
  });
});
