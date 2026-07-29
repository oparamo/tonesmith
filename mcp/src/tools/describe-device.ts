import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { CapabilityGroup } from "@tonesmith/core";
import { capabilityUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

/**
 * A group listing is an index, not a data dump: every item's full param specs would run to tens of
 * thousands of characters for a large group, which is more than some clients will accept in one
 * response. Items keep their identifying detail and their subtype ids; params come from drilling
 * into a single item, or from `includeParams` when the whole set really is wanted.
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
  help:
    "Call describe_device with item=<id> for that item's params, " +
    "or includeParams: true for every item's params at once. An item that lists subTypes needs one " +
    "of them chosen; an item with no subTypes is selected by its id alone.",
});

const registerDescribeDevice = (server: McpServer): void => {
  server.registerTool(
    "describe_device",
    {
      description:
        "Return capability metadata for a device — effect types, amp models, cabs, mics, etc. " +
        "Optionally filter to a single group (e.g. 'amp', 'fx', 'delay') or a single item within a group.",
      inputSchema: z.object({
        device: z.string().describe("Device ID (e.g. 'gx1'). Use list_devices to enumerate IDs."),
        group: z.string().optional().describe(
          "Group ID to filter to (e.g. 'amp', 'fx', 'odds', 'delay', 'reverb', 'cab', 'mic', 'ns', 'fv'), " +
            "or 'chain' for the signal-chain model (default block order and how blocks are reordered/" +
            "bypassed). Omit to list all groups plus a chain summary."
        ),
        item: z.string().optional().describe(
          "Item ID within the selected group to return in full detail. Requires 'group'."
        ),
        includeParams: z.boolean().optional().describe(
          "Include every item's full param specs in a group listing. Off by default — a listing is " +
            "an index; drill into one item for its params. Ignored when 'item' is given."
        ),
      }),
    },
    ({ device, group, item, includeParams }) => {
      try {
        const { capabilities } = registry.getDriver(device);

        if (!group) {
          const summary = {
            chain: {
              defaultOrder: capabilities.chain.defaultOrder,
              help: 'Call describe_device with group "chain" for how block order and on/off bypass work.',
            },
            groups: capabilities.groups.map(capGroup => ({
              id: capGroup.id,
              name: capGroup.name,
              description: capGroup.description,
              itemCount: capGroup.items.length,
            })),
          };
          return ok(JSON.stringify(summary, null, 2));
        }

        if (group === "chain") {
          return ok(JSON.stringify(capabilities.chain, null, 2));
        }

        const matched = capabilityUtils.findGroup(capabilities, group);

        if (!item) {
          const view = includeParams === true ? matched : groupIndex(matched);
          return ok(JSON.stringify(view, null, 2));
        }

        // The block's own controls apply to whichever item is selected, so an item view that
        // omitted them would hide amp's gain/bass/middle/treble entirely — they live on the group.
        const foundItem = capabilityUtils.findItem(matched, item);
        const itemView = { ...foundItem, params: [...(matched.params ?? []), ...(foundItem.params ?? [])] };
        return ok(JSON.stringify(itemView, null, 2));
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerDescribeDevice };
