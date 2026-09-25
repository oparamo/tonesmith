/**
 * The block contract, held against every driver on the roster.
 *
 * `PatchBlock` fixes one shape for every device: a block's own selectors, then one `params` bag.
 * That is what lets a caller read a patch from one device and write a patch for another without
 * relearning where the controls sit, and it is what keeps a device's controls free to carry
 * whatever names its panel prints, `type` among them.
 *
 * This runs over the roster rather than inside any one device's suite, so a device added later
 * inherits the guard instead of being trusted to write its own.
 */
import { describe, it, expect } from "vitest";
import { drivers } from "../../src/device";
import { present } from "../helpers";

/** The complete set of keys a block may carry beside its params. */
const SELECTORS = ["on", "type", "subType"];

interface BlockCase {
  driver: string;
  /** Where the example came from, so a failure names the lookup that produced it. */
  where: string;
  block: string;
  body: Record<string, unknown>;
}

const blockCases = (): BlockCase[] => drivers.flatMap(driver =>
  driver.capabilities.groups.flatMap(group => {
    const views = group.types.length > 0
      ? group.types.map(capType => ({ where: `${group.id}/${capType.id}`, example: capType.example }))
      : [{ where: group.id, example: group.example }];
    return views.flatMap(({ where, example }) =>
      Object.entries(example ?? {}).map(([block, body]) => ({
        driver: driver.id,
        where,
        block,
        body: body as Record<string, unknown>,
      }))
    );
  })
);

describe("every driver's blocks take one shape", () => {
  const cases = blockCases();

  it("the roster offers blocks to check at all", () => {
    expect(cases.length, "a driver with no block examples proves nothing here").toBeGreaterThan(0);
  });

  it.each(cases)("$driver $where", ({ block, body }) => {
    expect(body.params, `${block} carries its controls under params`).toBeDefined();

    const extra = Object.keys(body).filter(key => key !== "params" && !SELECTORS.includes(key));
    expect(extra, `${block} carries nothing beside its selectors and params`).toEqual([]);
  });
});

describe("every driver's chain names the blocks a spec names", () => {
  it.each(drivers.map(driver => ({ id: driver.id, driver })))("$id", ({ driver }) => {
    const { chain } = driver.capabilities;

    for (const block of chain.defaultOrder) {
      expect(chain.blocks, `chain block "${block}" has a label for display`).toHaveProperty(block);
    }
    // A patch built with no chain of its own stores the default order, so the two vocabularies have
    // to be the same one: a chain naming blocks a spec cannot name is a chain nobody can edit.
    const built = driver.buildPatch({ name: "Chain" });
    const stored = present(built.chain, `${driver.id} stores the chain it built with`);
    expect(new Set(stored)).toEqual(new Set(chain.defaultOrder));
  });
});

describe("every driver's view shows the patch under the chain's own names", () => {
  it.each(drivers.map(driver => ({ id: driver.id, driver })))("$id", ({ driver }) => {
    const { chain } = driver.capabilities;
    const view = driver.viewPatch(driver.buildPatch({ name: "View" }));

    const keys = view.blocks.map(block => block.key);
    expect(new Set(keys), "the view covers every block the chain names").toEqual(
      new Set(chain.defaultOrder)
    );
    for (const block of view.blocks) {
      expect(block.label, `${block.key} is shown under its panel label`).toBe(chain.blocks[block.key]);
      expect(block.params, `${block.key} carries its controls`).toBeDefined();
    }
  });
});

/**
 * A caller shows or saves what `buildPatch` returns, so it has to be what the file will hold. A
 * builder that mutates a block in place can leave fields of the type it replaced, which a read of
 * the saved file would not show. Serialized on both sides, since the codec attaches its raw bytes
 * under a symbol that JSON drops.
 */
describe("every driver builds a patch as its file stores it", () => {
  const cases = blockCases();

  it.each(cases)("$driver $where", ({ driver: id, block, body }) => {
    const driver = present(drivers.find(candidate => candidate.id === id), `driver ${id}`);
    const built = driver.buildPatch({ name: "Stored", [block]: body });
    const stored = driver.decodePatch(driver.encodePatch(built));

    expect(JSON.parse(JSON.stringify(built))).toEqual(JSON.parse(JSON.stringify(stored)));
  });
});
