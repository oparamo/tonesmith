import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { FACTORY_BLOCKS } from "../../../../src/device/gx1/format/factoryPatch";
import { parseFile } from "../../../../src/device/gx1/format/tsl";
import { RAW } from "../../../../src/device/gx1/model";
import { DEFAULT_INIT_FIXTURE } from "../helpers";
import { present } from "../../../helpers";

describe("FACTORY_BLOCKS", () => {
  it("holds every block of default-init.tsl except MEMORY%COM byte for byte", async () => {
    const factory = present(parseFile(await readFile(DEFAULT_INIT_FIXTURE), "default-init").patches[0], "the factory patch");
    const paramSet = factory[RAW];

    const actual = Object.fromEntries(Object.keys(FACTORY_BLOCKS).map(block => [block, paramSet[block]]));
    const expected = Object.fromEntries(
      Object.entries(FACTORY_BLOCKS).map(([block, hex]) => [block, present(hex.match(/../g), block)])
    );
    expect(actual).toStrictEqual(expected);
  });
});
