import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { blankPatch, parseFile, serializeFile } from "../../src/device/gx1/format/tsl";
import { encodePatch } from "../../src/device/gx1/format/codec";
import { PATCH_SETTING_FIELDS } from "../../src/device/gx1/format/codec/blocks";
import { gx1Capabilities } from "../../src/device/gx1/catalog/capabilities";
import { driver } from "../../src/device/gx1/driver";
import { BLOCK_NAMES, BLOCK_GROUPS } from "../../src/device/gx1/model";
import { ROCK_TONES_FIXTURE as FIXTURE } from "../device/gx1/helpers";
import { present } from "../helpers";

// A whole-fixture byte round trip through the real committed patch set, crossing parseFile, every
// block codec, and serializeFile on purpose (rule 7), rather than a self-consistency check on
// synthetic bytes.

const fixtureBytes = await readFile(FIXTURE);
const file = parseFile(fixtureBytes, FIXTURE);
const rawEnvelope = JSON.parse(new TextDecoder().decode(fixtureBytes)) as {
  data: [{ paramSet: Record<string, string[]> }[], unknown[]];
};

const patchCases = file.patches.map((patch, index) => ({
  index,
  patch,
  originalParamSet: present(rawEnvelope.data[0][index], `raw patch ${index}`).paramSet,
}));

describe("GX-1 round trip", () => {
  it.each(patchCases)("decodePatch + encodePatch preserves patch $index's paramSet byte for byte", ({ patch, originalParamSet }) => {
    const reencoded = encodePatch(patch);

    expect(reencoded.paramSet).toStrictEqual(originalParamSet);
  });

  it.each(patchCases)("serializeFile + parseFile preserves patch $index's paramSet byte for byte", ({ index, originalParamSet }) => {
    const writtenBytes = serializeFile(file);
    const writtenRaw = JSON.parse(new TextDecoder().decode(writtenBytes)) as typeof rawEnvelope;

    expect(present(writtenRaw.data[0][index], `written patch ${index}`).paramSet).toStrictEqual(originalParamSet);
  });
});

describe("GX-1 patch settings round-trip through buildPatch", () => {
  it("takes the settings of a patch read off the device straight back as a spec", () => {
    const patch = blankPatch("Test") as unknown as Record<string, unknown>;
    const settingsKeys = PATCH_SETTING_FIELDS.map(field => field.name);
    const settings = Object.fromEntries(settingsKeys.map(key => [key, patch[key]]));

    const rebuilt = driver.buildPatch({ name: "Test", ...settings }) as unknown as Record<string, unknown>;

    expect(rebuilt).toMatchObject(settings);
  });
});

// The example exists to answer where a param is written, and the one check that covers block key,
// nesting, defaults and the validator at once is whether it builds, so that check runs here rather
// than duplicating the catalog's own shape checks (capabilities.test.ts) with a slower one.
describe("GX-1 spec examples build through buildPatch", () => {
  const groupsWithBlocks = gx1Capabilities.groups.filter(group => BLOCK_NAMES.some(
    name => BLOCK_GROUPS[name] === group.id
  ));

  const examples = groupsWithBlocks.flatMap(group => {
    if (group.types.length === 0) return [{ group: group.id, type: "", example: group.example }];
    return group.types.map(capType => ({ group: group.id, type: capType.id, example: capType.example }));
  });

  it.each(examples)("$group $type's example builds as it stands", ({ example }) => {
    const build = (): unknown => driver.buildPatch({ name: "Example", ...example });

    expect(build).not.toThrow();
  });
});
