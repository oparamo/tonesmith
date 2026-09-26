import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CapabilityGroup, CapabilityType, DeviceCapabilities, FieldEdit, FieldEdits, FieldValue, ParamSpec,
  Patch, PatchBlock, PatchDriver, PatchFile, PatchView,
} from "@tonesmith/core";
import { capabilityService, messageOf, registry } from "@tonesmith/core";
import { buildServer } from "../src/server";

/**
 * A value the test has already established is there: the patch a tool just wrote, the entry a
 * response just reported. Failing here says which one was missing, where the alternative is a
 * cascade of assertions against `undefined`.
 */
const present = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Expected ${what}, got nothing`);
  return value;
};

/** Whether a path exists. Only a missing file answers no; any other failure is rethrown. */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
};

/** An empty scratch dir, for tools that write a file from scratch. */
const emptyTempDir = async (): Promise<{ dir: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-mcp-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

/** Connects a fresh in-process server + client pair. */
const connectRaw = async (): Promise<{ client: Client; close: () => Promise<void> }> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await buildServer().connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: () => client.close() };
};

interface ToolResult {
  text: string;
  isError: boolean;
}

/** `callTool` answers with the first content block's text, the only block any tool here returns. */
const connectClient = async (): Promise<{
  client: Client;
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  getToolSchema: (name: string) => Promise<unknown>;
  close: () => Promise<void>;
}> => {
  const { client, close } = await connectRaw();

  const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const result = await client.callTool({ name, arguments: args });
    const [block] = result.content as { type: string; text: string }[];
    return { text: present(block, "a content block").text, isError: result.isError === true };
  };

  const getToolSchema = async (name: string): Promise<unknown> => {
    const { tools } = await client.listTools();
    return present(tools.find(candidate => candidate.name === name), `a tool registered as "${name}"`);
  };

  return { client, callTool, getToolSchema, close };
};

// ── A fake driver ──────────────────────────────────────────────────────────────
//
// A unit suite for one tool has to fail only on that tool's own logic, never on a gx1 catalog
// change, so every tool suite but the integration ones runs against this device instead. Its
// catalog is hand-written to carry the shapes a real device spreads across many types: a type id
// containing a slash, a group with no types, a group with block-level params, a type with
// subTypes. Patches are plain JSON, so there is no codec to write or keep in sync.

type FakePatch = Patch & Record<string, unknown>;

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

const numericParam = (key: string, min: number, max: number): ParamSpec => ({
  kind: "numeric", name: key, key, range: `${min}-${max}`, description: `The ${key} control.`, min, max,
});

/** The fixed id every unit suite registers its fake driver under. */
const FAKE_DEVICE_ID = "quirk";

const fakeCapabilities: DeviceCapabilities = {
  chain: {
    description: "Three blocks in a fixed line: two bypassable, one always in the signal.",
    defaultOrder: ["core", "extra", "solo"],
    blocks: {
      core: { label: "Core", group: "core", bypass: true },
      extra: { label: "Extra", group: "extra", bypass: true },
      solo: { label: "Solo", group: "solo", bypass: false },
    },
  },
  patchName: { maxLength: 24 },
  patchSettings: [numericParam("tempo", 40, 240)],
  groups: [
    {
      id: "core",
      name: "Core",
      description: "The primary block, offering two types.",
      params: [numericParam("level", 0, 100)],
      types: [
        {
          id: "ALPHA",
          name: "Alpha",
          description: "The first type.",
          params: [numericParam("gain", 0, 100)],
          example: { core: { type: "ALPHA", params: { gain: 50 } } },
        },
        {
          id: "BETA/GAMMA",
          name: "Beta Gamma",
          description: "A type whose own id contains a slash, with two named sub-models.",
          subTypes: [
            { id: "ONE", name: "One", description: "The first model." },
            { id: "TWO", name: "Two", description: "The second model." },
          ],
        },
      ],
    },
    {
      id: "extra",
      name: "Extra",
      description: "A second block, for entries and examples naming more than one group.",
      types: [
        { id: "X", name: "X", description: "Its only type." },
      ],
    },
    {
      id: "solo",
      name: "Solo",
      description: "A block with no types to choose between.",
      params: [numericParam("threshold", 0, 100)],
      example: { solo: { params: { threshold: 10 } } },
      types: [],
    },
  ],
};

const defaultFor = (spec: ParamSpec): FieldValue => {
  if (spec.kind === "boolean") return false;
  if (spec.kind === "discrete") return present(spec.values[0], `${spec.key ?? spec.name}'s first value`);
  return spec.min;
};

const defaultParams = (specs: readonly ParamSpec[]): Record<string, FieldValue> =>
  Object.fromEntries(
    specs.filter((spec): spec is ParamSpec & { key: string } => spec.key !== undefined)
      .map(spec => [spec.key, defaultFor(spec)]),
  );

/** The group's first type when a spec names none; `undefined` on a group with no types at all. */
const resolveType = (group: CapabilityGroup, requestedId: string | undefined): CapabilityType | undefined => {
  if (group.types.length === 0) return undefined;
  const firstId = present(group.types[0], `${group.id}'s first type`).id;
  return capabilityService.findType(group, requestedId ?? firstId);
};

/** A sub-model name as a patch stores it: text, or `null` where the spec named none. */
const scalarSubType = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

const buildFakeBlock = (caps: DeviceCapabilities, blockName: string, spec: Record<string, unknown>): PatchBlock => {
  const chainBlock = present(caps.chain.blocks[blockName], `chain block "${blockName}"`);
  const group: CapabilityGroup = capabilityService.findGroup(caps, chainBlock.group);
  const requestedId = typeof spec.type === "string" ? spec.type : undefined;
  const type = resolveType(group, requestedId);

  const params = { ...defaultParams([...(group.params ?? []), ...(type?.params ?? [])]), ...asRecord(spec.params) };
  const block: PatchBlock = { params: params as Record<string, FieldValue> };
  if (chainBlock.bypass) block.on = Boolean(spec.on ?? true);
  if (type !== undefined) {
    block.type = type.id;
    block.subType = scalarSubType(spec.subType);
  }
  return block;
};

/** A driver's `buildPatch`, bound to one catalog. Every chain block the spec omits stays off. */
const buildFakePatch = (caps: DeviceCapabilities) => (input: unknown): FakePatch => {
  const spec = asRecord(input);
  const name = spec.name;
  if (typeof name !== "string" || name.length === 0) throw new Error("Every patch needs a name.");

  const patch: FakePatch = { name };
  if (Array.isArray(spec.chain)) patch.chain = spec.chain as string[];
  for (const blockName of Object.keys(caps.chain.blocks)) {
    if (spec[blockName] !== undefined) patch[blockName] = buildFakeBlock(caps, blockName, asRecord(spec[blockName]));
  }
  return patch;
};

/** "72" becomes the number 72 against a field that already holds one; a field holding text is left as text. */
const coerce = (value: FieldValue, existing: unknown): FieldValue => {
  if (typeof value !== "string" || typeof existing === "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  const asNumber = Number(value);
  const coerced = Number.isNaN(asNumber) ? value : asNumber;
  return coerced;
};

/** Walks all but a path's last segment, throwing when an intermediate segment isn't an object. */
const resolveHolder = (patch: FakePatch, parts: readonly string[], path: string): Record<string, unknown> => {
  let holder = patch as unknown as Record<string, unknown>;
  for (const part of parts) {
    const next = holder[part];
    if (typeof next !== "object" || next === null) {
      throw new Error(`Unknown field path "${path}": "${part}" is not a field here.`);
    }
    holder = next as Record<string, unknown>;
  }
  return holder;
};

const applyFakeEdits = (patch: FakePatch, edits: readonly FieldEdit[]): FieldEdits => {
  const applied: FieldEdits = {};
  for (const [path, value] of edits) {
    const parts = path.split(".");
    const key = present(parts.pop(), `a field name in "${path}"`);
    const holder = resolveHolder(patch, parts, path);
    if (!(key in holder)) {
      const valid = Object.keys(holder).sort().join(", ");
      throw new Error(`Unknown field path "${path}": "${key}" is not a field here. Valid fields at this level: ${valid}`);
    }
    const coerced = coerce(value, holder[key]);
    holder[key] = coerced;
    applied[path] = coerced;
  }
  return applied;
};

const viewFakePatch = (patch: FakePatch): PatchView => ({ name: patch.name, details: [], blocks: [] });

const newFakeFile = (id: string) => (setName: string, nPatches = 1): PatchFile<FakePatch> => ({
  name: setName,
  device: id,
  patches: Array.from({ length: nPatches }, (_, index) => ({ name: `Patch ${index + 1}` })),
});

const parseFakeFile = (bytes: Uint8Array, source: string): PatchFile<FakePatch> => {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as PatchFile<FakePatch>;
  } catch (error) {
    throw new Error(`${source}: not a fake-device patch file (${messageOf(error)})`);
  }
};

const serializeFakeFile = (file: PatchFile<FakePatch>): Uint8Array => new TextEncoder().encode(JSON.stringify(file));

/** Builds and registers a fake driver under `id`, for a suite that needs a catalog of its own. */
const buildFakeDriver = (id: string, capabilities: DeviceCapabilities): PatchDriver<FakePatch> => {
  const driver: PatchDriver<FakePatch> = {
    id,
    name: `Fake device (${id})`,
    capabilities,
    parseFile: parseFakeFile,
    serializeFile: serializeFakeFile,
    newFile: newFakeFile(id),
    buildPatch: buildFakePatch(capabilities),
    applyEdits: applyFakeEdits,
    viewPatch: viewFakePatch,
  };
  registry.registerDriver(driver);
  return driver;
};

const fakeDriver = buildFakeDriver(FAKE_DEVICE_ID, fakeCapabilities);

export {
  connectClient, connectRaw, emptyTempDir, present, pathExists,
  FAKE_DEVICE_ID, fakeCapabilities, fakeDriver, buildFakeDriver,
};
export type { FakePatch };
