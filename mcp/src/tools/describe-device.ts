import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { capabilityUtils, registry } from "@tonesmith/core";
import { ok, err } from "../common";

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
      }),
    },
    ({ device, group, item }) => {
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
          return ok(JSON.stringify(matched, null, 2));
        }

        const foundItem = capabilityUtils.findItem(matched, item);
        return ok(JSON.stringify(foundItem, null, 2));
      } catch (error) {
        return err(error);
      }
    }
  );
};

export { registerDescribeDevice };
