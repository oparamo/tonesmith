/**
 * The driver contract, held against every driver on the roster: block shape, chain vocabulary,
 * view labels, and a built patch matching what its file stores.
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
import type { PatchDriver } from "../../src/model";
import { present, storedAs } from "../helpers";

/**
 * Widened to the device-agnostic contract: today's roster of one driver narrows `Patch.chain` to
 * always be present, which would make the optional-chain case below look unreachable to the type
 * checker even though a future device's chain is optional by contract.
 */
const roster: PatchDriver[] = drivers;

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

const driverCases = roster.map(driver => ({ id: driver.id, driver }));

describe("the roster", () => {
  it("gives every driver a unique id", () => {
    const ids = drivers.map(driver => driver.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("every driver's blocks take one shape", () => {
  const cases = blockCases();

  it("the roster offers blocks to check at all", () => {
    expect(cases.length, "a driver with no block examples proves nothing here").toBeGreaterThan(0);
  });

  it.each(cases)("$driver $where", ({ block, body }) => {
    expect(body.params, `${block} carries its controls under params`).toBeDefined();

    const extra = Object.keys(body).filter(key => key !== "params" && !SELECTORS.includes(key));
    expect(extra, `${block} carries nothing beside its selectors and params`).toStrictEqual([]);
  });
});

describe("every driver's chain vocabulary", () => {
  it.each(driverCases)("$id: defaultOrder and chain.blocks name the same blocks", ({ driver }) => {
    const { chain } = driver.capabilities;

    expect(new Set(Object.keys(chain.blocks))).toStrictEqual(new Set(chain.defaultOrder));
  });

  // A patch built with no chain of its own stores the default order, so the two vocabularies have
  // to be the same one: a chain naming blocks a spec cannot name is a chain nobody can edit. Only a
  // driver whose built patch actually carries a chain is in scope: Patch.chain is optional by
  // contract, for a device with a fixed, unrearrangeable order.
  const chainedDriverCases = driverCases.filter(
    ({ driver }) => driver.buildPatch({ name: "Chain" }).chain !== undefined
  );

  it.each(chainedDriverCases)("$id: a patch built with no chain stores the default order's blocks", ({ driver }) => {
    const { chain } = driver.capabilities;
    const built = driver.buildPatch({ name: "Chain" });
    const stored = present(built.chain, `${driver.id} stores the chain it built with`);

    expect(new Set(stored)).toStrictEqual(new Set(chain.defaultOrder));
  });
});

describe("every driver's chain blocks point at the groups that describe them", () => {
  it.each(driverCases)("$id: every chain block names a real group", ({ driver }) => {
    const { chain, groups } = driver.capabilities;
    const groupIds = groups.map(group => group.id);

    const unknownGroups = Object.entries(chain.blocks)
      .filter(([, block]) => !groupIds.includes(block.group))
      .map(([name]) => name);

    expect(unknownGroups).toStrictEqual([]);
  });

  // A type scoped to some blocks has to name blocks its own group describes, or the scope points a
  // caller at a block that can never hold it.
  it.each(driverCases)("$id: a type scoped to blocks names blocks of its own group", ({ driver }) => {
    const { chain, groups } = driver.capabilities;

    const misscoped = groups.flatMap(group => {
      const blocksOfGroup = Object.keys(chain.blocks).filter(name => chain.blocks[name]?.group === group.id);
      return group.types
        .flatMap(type => type.blocks ?? [])
        .filter(scoped => !blocksOfGroup.includes(scoped))
        .map(scoped => `${group.id}/${scoped}`);
    });

    expect(misscoped).toStrictEqual([]);
  });
});

describe("every driver's view shows the patch under the chain's own names", () => {
  it.each(driverCases)("$id: the view covers every block the chain names", ({ driver }) => {
    const { chain } = driver.capabilities;
    const view = driver.viewPatch(driver.buildPatch({ name: "View" }));

    const keys = view.blocks.map(block => block.key);
    expect(new Set(keys)).toStrictEqual(new Set(chain.defaultOrder));
  });

  it.each(driverCases)("$id: each view block carries its chain label", ({ driver }) => {
    const { chain } = driver.capabilities;
    const view = driver.viewPatch(driver.buildPatch({ name: "View" }));

    expect(view.blocks.map(block => [block.key, block.label])).toStrictEqual(
      view.blocks.map(block => [block.key, chain.blocks[block.key]?.label])
    );
  });
});

describe("every driver's new file", () => {
  it.each(driverCases)("$id: round-trips through its own driver and names that driver", ({ driver }) => {
    const file = driver.newFile("x", 1);

    const reloaded = driver.parseFile(driver.serializeFile(file), "round-trip");

    expect(reloaded.device).toBe(driver.id);
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
    const stored = storedAs(driver, built);

    expect(JSON.parse(JSON.stringify(built))).toStrictEqual(JSON.parse(JSON.stringify(stored)));
  });
});
