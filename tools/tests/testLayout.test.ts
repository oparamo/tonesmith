/**
 * Every source module has a unit suite at its mirror path (`src/x/foo.ts` is tested by
 * `tests/x/foo.test.ts`), so which suite owns a module is never a question and a module tested only
 * through another one's suite shows up here. The exemptions are named one by one: a new file is
 * either tested where the rule says or argued into this list.
 */
import { describe, it, expect } from "vitest";
import { access, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "../..");
const PACKAGES = ["core", "cli", "mcp"];

/** Re-export only: every name they carry is tested where it is defined. */
const BARRELS = [
  "core/src/device/gx1/format/codec/index.ts",
  "core/src/device/gx1/index.ts",
  "core/src/device/gx1/model/index.ts",
  "core/src/device/gx1/spec/index.ts",
  "core/src/model/index.ts",
  "cli/src/common/index.ts",
  "mcp/src/common/index.ts",
  "mcp/src/prompt/index.ts",
  "mcp/src/tool/index.ts",
];

/** Types only: erased at build, and held by the compiler rather than a test. */
const TYPE_ONLY = [
  "core/src/device/gx1/model/block.ts",
  "core/src/device/gx1/model/patch.ts",
  "core/src/device/gx1/model/tsl.ts",
  "core/src/model/capabilities.ts",
  "core/src/model/driver.ts",
  "core/src/model/patch.ts",
  "core/src/model/view.ts",
];

/**
 * Constant data with no logic of its own: a test would assert a value against itself. The drift
 * guards and the integration suites hold these to the device and to one another.
 */
const CONSTANT_TABLES = [
  "core/src/common/blockField.ts",
  "core/src/device/gx1/catalog/paramCatalog.ts",
  "core/src/device/gx1/model/blockName.ts",
  "core/src/device/gx1/model/raw.ts",
  "core/src/device/index.ts",
  "mcp/src/common/schemas.ts",
];

/** Bin entry points: one line that starts the program, run by the integration suites. */
const BIN_ENTRIES = ["cli/src/index.ts", "mcp/src/index.ts"];

const EXEMPT = new Set([...BARRELS, ...TYPE_ONLY, ...CONSTANT_TABLES, ...BIN_ENTRIES]);

const sourceFiles = async (pkg: string): Promise<string[]> => {
  const entries = await readdir(join(REPO_ROOT, pkg, "src"), { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith(".ts"))
    .map(entry => relative(REPO_ROOT, join(entry.parentPath, entry.name)));
};

const mirrorTest = (source: string): string => {
  const [pkg, , ...rest] = source.split("/");
  return join(pkg ?? "", "tests", ...rest).replace(/\.ts$/u, ".test.ts");
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(join(REPO_ROOT, path));
    return true;
  } catch {
    return false;
  }
};

const allSources = (await Promise.all(PACKAGES.map(sourceFiles))).flat().sort();
const tested = allSources.filter(source => !EXEMPT.has(source));
const presence = await Promise.all(tested.map(async source => ({ source, found: await exists(mirrorTest(source)) })));

describe("test layout", () => {
  it("finds source modules to check at all", () => {
    expect(tested.length).toBeGreaterThan(0);
  });

  it("gives every source module a unit suite at its mirror path", () => {
    const missing = presence.filter(({ found }) => !found).map(({ source }) => mirrorTest(source));

    expect(missing).toStrictEqual([]);
  });

  it("names only exemptions that still exist", () => {
    const stale = [...EXEMPT].filter(path => !allSources.includes(path));

    expect(stale).toStrictEqual([]);
  });

  it("exempts no module that has a suite of its own", async () => {
    const exemptWithSuites = await Promise.all([...EXEMPT].map(async path => ({ path, found: await exists(mirrorTest(path)) })));
    const contradictions = exemptWithSuites.filter(({ found }) => found).map(({ path }) => path);

    expect(contradictions).toStrictEqual([]);
  });
});
