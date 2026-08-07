import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CapabilityGroup, DeviceCapabilities } from "@tonesmith/core";
import { capabilityUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

/**
 * A group listing is an index, not a data dump: every item's full param specs would run to tens of
 * thousands of characters for a large group, which is more than some clients will accept in one
 * response. Items keep their identifying detail and their subtype ids; params come from naming a
 * single item, or from `includeParams` when the whole set really is wanted.
 */
const groupIndex = (group: CapabilityGroup): object => ({
  id: group.id,
  name: group.name,
  description: group.description,
  params: group.params,
  items: group.items.map(item => ({
    id: item.id,
    name: item.name,
    models: item.models,
    description: item.description,
    subTypes: item.subTypes?.map(subType => subType.id),
  })),
  help: `Name an item as "${group.id}/<id>" in \`items\` for its params, or pass includeParams: true for every item's at once.`,
});

/**
 * Splits an `items` entry into its group and optional item id, on the FIRST slash only: item ids can
 * themselves contain a slash (the fx effect type "OD/DS"), so "fx/OD/DS" must resolve to group "fx",
 * item "OD/DS" rather than being torn apart.
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
  // "chain" carries the patch-name limit too. It belongs to no group, so a caller asking only for
  // groups would never meet it, and finding it out by being rejected costs a patch already built.
  if (entry === "chain") return { ...capabilities.chain, patchName: capabilities.patchName };

  const { group, item } = splitEntry(entry);
  const matched = capabilityUtils.findGroup(capabilities, group);

  if (item === undefined) {
    const view = includeParams === true ? matched : groupIndex(matched);
    return view;
  }

  // The block's own controls apply to whichever item is selected, and they live on the group, so
  // an item view that omitted them would hide amp's gain/bass/middle/treble entirely.
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
      throw new Error(`items entry "${entry}": ${(error as Error).message}`);
    }
  }
  return views;
};

const deviceSummary = (capabilities: DeviceCapabilities): object => ({
  chain: {
    defaultOrder: capabilities.chain.defaultOrder,
    help: 'Pass items: ["chain"] for how block order and on/off bypass work.',
  },
  patchName: capabilities.patchName,
  groups: capabilities.groups.map(capGroup => ({
    id: capGroup.id,
    name: capGroup.name,
    description: capGroup.description,
    itemCount: capGroup.items.length,
  })),
  help: 'e.g. items: ["chain", "amp", "fx/CHORUS", "reverb/HALL M"].',
});

const registerDescribeDevice = (server: McpServer): void => {
  server.registerTool(
    "describe_device",
    {
      description:
        "Return capability metadata for a device: signal chain, effect types, amp models, cabs, " +
        "mics, and every param with its key, range, and allowed values.",
      inputSchema: z.object({
        device: z.string().describe("Device ID (e.g. 'gx1'). Use list_devices to enumerate IDs."),
        items: z.array(z.string()).optional().describe(
          "What to look up, as a list. Each entry is one of: \"chain\" for the signal-chain model " +
            "(default block order, reordering, and how blocks are bypassed); a group id such as " +
            '"amp", "fx", "odds", "delay", "reverb", "cab", "mic", "ns", "fv" for that group\'s ' +
            'index; or "<group>/<item>" such as "fx/CHORUS", "amp/JC-120", "reverb/HALL M" for one ' +
            "item's full params. List every entry you need in a single call, which is what this " +
            "input is for. Omit to list all groups plus a chain summary. An unknown entry fails " +
            "the whole call and names itself."
        ),
        includeParams: z.boolean().optional().describe(
          "Include every item's full param specs for bare-group entries. Off by default, since a " +
            "group listing is an index; name the items you want instead. Ignored for " +
            "\"<group>/<item>\" entries."
        ),
      }),
    },
    ({ device, items, includeParams }) => {
      try {
        const { capabilities } = registry.getDriver(device);

        if (!items || items.length === 0) {
          return ok(JSON.stringify(deviceSummary(capabilities)));
        }

        return ok(JSON.stringify(viewsForEntries(capabilities, items, includeParams)));
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerDescribeDevice };
