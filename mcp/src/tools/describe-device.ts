import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CapabilityGroup, CapabilityItem, DeviceCapabilities } from "@tonesmith/core";
import { capabilityUtils, registry } from "@tonesmith/core";
import { attempt, deviceField, messageOf, ok } from "../common";

/**
 * A group listing is an index, not a data dump: every item's full param specs would run to tens of
 * thousands of characters for a large group, which is more than some clients will accept in one
 * response. Items keep their identifying detail and their subtype ids; params come from naming a
 * single item, or from `includeParams` when the whole set really is wanted.
 */
const groupIndex = (group: CapabilityGroup): object => {
  // A group offering types shows its example on each item; one offering none has no other view to
  // carry it, and its params are right here, so it would otherwise say nothing about placement.
  const example = group.items.length === 0 ? group.example : undefined;
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    params: group.params,
    example,
    items: group.items.map(item => ({
      id: item.id,
      name: item.name,
      models: item.models,
      description: item.description,
      subTypes: item.subTypes?.map(subType => subType.id),
    })),
    help: `Name an item as "${group.id}/<id>" in \`items\` for its params, or pass includeParams: true for every item's at once.`,
  };
};

/**
 * The whole group, minus the per-item examples. A caller asking for every item's params at once is
 * reading the catalog rather than building one block, and the largest group's 39 examples would add
 * several KB to a response already large enough to need watching.
 */
const fullGroup = (group: CapabilityGroup): object => {
  const items = group.items.map(item => {
    const bare: CapabilityItem = { ...item };
    delete bare.example;
    return bare;
  });
  return { ...group, items };
};

/**
 * Splits an `items` entry into its group and optional item id, on the FIRST slash only: an item id
 * is a device's own label and may contain a slash itself, so "<group>/A/B" has to resolve to group
 * "<group>", item "A/B" rather than being torn apart.
 */
const splitEntry = (entry: string): { group: string; item?: string } => {
  const slash = entry.indexOf("/");
  if (slash < 0) return { group: entry };
  return { group: entry.slice(0, slash), item: entry.slice(slash + 1) };
};

/** Resolves one `items` entry to the view it names: the chain model, a group index/full group, or one item. */
const viewForEntry = (
  capabilities: DeviceCapabilities,
  entry: string,
  includeParams: boolean | undefined,
): object => {
  // "chain" carries what belongs to the patch rather than to any group: the name limit, and the
  // settings written beside the name. A caller asking only for groups would never meet either, and
  // finding one out by being rejected costs a patch already built.
  if (entry === "chain") {
    const { patchName, patchSettings } = capabilities;
    return { ...capabilities.chain, patchName, patchSettings };
  }

  const { group, item } = splitEntry(entry);
  const matched = capabilityUtils.findGroup(capabilities, group);

  if (item === undefined) {
    const view = includeParams === true ? fullGroup(matched) : groupIndex(matched);
    return view;
  }

  // A block's own controls apply to whichever item is selected, and they live on the group, so an
  // item view that omitted them would hide every control the block carries outside its items.
  const foundItem = capabilityUtils.findItem(matched, item);
  return { ...foundItem, params: [...(matched.params ?? []), ...(foundItem.params ?? [])] };
};

/**
 * Resolves every requested entry, keyed by the entry string the caller asked for so a batch of
 * twenty reads the same way as a batch of one. A single bad entry fails the whole call, since a
 * partially resolved response would leave the caller to notice the hole themselves.
 */
const viewsForEntries = (
  capabilities: DeviceCapabilities,
  entries: string[],
  includeParams: boolean | undefined,
): Record<string, object> => {
  const views: Record<string, object> = {};
  for (const entry of entries) {
    try {
      views[entry] = viewForEntry(capabilities, entry, includeParams);
    } catch (error) {
      throw new Error(`items entry "${entry}": ${messageOf(error)}`);
    }
  }
  return views;
};

/**
 * An `items` list drawn from the device in hand: a group id and a couple of "<group>/<item>"
 * entries it really has. Written out by hand it names one device's groups and effects, which on
 * every other device makes it an example that fails the call it is showing how to make.
 */
const exampleEntries = (capabilities: DeviceCapabilities): string[] => {
  const bareGroup = capabilities.groups.slice(0, 1).map(group => group.id);
  const namedItems = capabilities.groups
    .slice(1)
    .flatMap(group => {
      const [item] = group.items;
      const entry = item === undefined ? [] : [`${group.id}/${item.id}`];
      return entry;
    })
    .slice(0, 2);
  return ["chain", ...bareGroup, ...namedItems];
};

const deviceSummary = (capabilities: DeviceCapabilities): object => ({
  chain: {
    defaultOrder: capabilities.chain.defaultOrder,
    help: 'Pass items: ["chain"] for how block order and on/off bypass work, and for the settings the patch carries itself.',
  },
  patchName: capabilities.patchName,
  // Every id an `items` entry can name, so the next call is writeable off this response alone
  // rather than after a listing call per group.
  groups: capabilities.groups.map(capGroup => ({
    id: capGroup.id,
    name: capGroup.name,
    description: capGroup.description,
    typeIds: capGroup.items.map(item => item.id),
  })),
  help: `Name any type above as "<group>/<type>" in \`items\` for its params and a copyable example. e.g. items: ${JSON.stringify(exampleEntries(capabilities))}.`,
});

const registerDescribeDevice = (server: McpServer): void => {
  server.registerTool(
    "describe_device",
    {
      description:
        "Return capability metadata for a device: its signal chain, every block with the types " +
        "and models it offers, and every param with its key, range, and allowed values. Naming " +
        "an item also returns an `example`: that block's spec at the device's factory defaults, " +
        "showing where each param is written. Copy it into generate_patch and change the values " +
        "you care about.",
      inputSchema: z.object({
        device: deviceField,
        items: z.array(z.string()).optional().describe(
          "What to look up, as a list. Each entry is one of: \"chain\" for the signal-chain model " +
            "(default block order, reordering, how blocks are bypassed, and the settings the patch " +
            "carries itself rather than in a block); a group id for that " +
            'group\'s index; or "<group>/<item>" for one item\'s full params, split on the first ' +
            "slash so an item id containing one still resolves. Omit `items` to list this device's " +
            "groups and every type id in them, which is where the ids come from. List every entry you need in a " +
            "single call, which is what this input is for. An unknown entry fails the whole call " +
            "and names itself."
        ),
        includeParams: z.boolean().optional().describe(
          "Include every item's full param specs for bare-group entries. Off by default, since a " +
            "group listing is an index; name the items you want instead. Ignored for " +
            "\"<group>/<item>\" entries."
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ device, items, includeParams }) => attempt(() => {
      const { capabilities } = registry.getDriver(device);

      if (!items || items.length === 0) {
        return ok(JSON.stringify(deviceSummary(capabilities)));
      }

      return ok(JSON.stringify(viewsForEntries(capabilities, items, includeParams)));
    })
  );
};

export { registerDescribeDevice };
