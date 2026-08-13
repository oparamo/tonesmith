import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../src/atomic-write";

describe("writeFileAtomic", () => {
  let dir = "";
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const scratch = (): string => {
    dir = mkdtempSync(join(tmpdir(), "tonesmith-atomic-"));
    return dir;
  };

  it("writes the contents, creating any missing parent directories", () => {
    const path = join(scratch(), "nested", "deeper", "set.tsl");

    writeFileAtomic(path, "contents");

    expect(readFileSync(path, "utf8")).toBe("contents");
  });

  it("replaces an existing file and leaves no temporary file behind", () => {
    const root = scratch();
    const path = join(root, "set.tsl");
    writeFileSync(path, "old");

    writeFileAtomic(path, "new");

    expect(readFileSync(path, "utf8")).toBe("new");
    expect(readdirSync(root)).toEqual(["set.tsl"]);
  });

  // The point of the sibling file: the target is never opened for writing, so a write that cannot
  // finish leaves the library as it was rather than truncated to nothing.
  it("leaves the target alone and cleans up when the write cannot complete", () => {
    const root = scratch();
    const path = join(root, "set.tsl");
    writeFileSync(path, "the library");
    const blocked = join(root, "blocked");
    mkdirSync(blocked);

    const writeOverADirectory = () => { writeFileAtomic(blocked, "contents"); };

    expect(writeOverADirectory).toThrow();
    expect(readFileSync(path, "utf8")).toBe("the library");
    expect(readdirSync(root).sort()).toEqual(["blocked", "set.tsl"]);
  });
});
