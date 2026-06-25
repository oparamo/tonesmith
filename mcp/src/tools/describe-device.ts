import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { z } from "zod";
import { ok, err, requireDriver } from "../common";

const registerDescribeDevice = (server: McpServer): void => {
  server.registerTool(
    "describe_device",
    {
      description:
        "Return capability metadata for a device — effect types, amp models, cabs, mics, etc. " +
        "Optionally filter to a single group (e.g. 'amp', 'fx', 'delay') or a single item within a group.",
      inputSchema: {
        device: z.string().describe("Device ID (e.g. 'gx1'). Use list_devices to enumerate IDs."),
        group: z.string().optional().describe(
          "Group ID to filter to (e.g. 'amp', 'fx', 'odds', 'delay', 'reverb', 'cab', 'mic', 'ns', 'fv'). " +
            "Omit to list all groups."
        ),
        item: z.string().optional().describe(
          "Item ID within the selected group to return in full detail. Requires 'group'."
        ),
      },
    },
    async ({ device, group, item }) => {
      try {
        const { capabilities } = requireDriver(device);

        if (!group) {
          const summary = capabilities.groups.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
            itemCount: g.items.length,
          }));
          return ok(JSON.stringify(summary, null, 2));
        }

        const groupLower = group.toLowerCase();
        const matched = capabilities.groups.find(g => g.id.toLowerCase() === groupLower);
        if (!matched) {
          const ids = capabilities.groups.map(g => g.id).join(", ");
          return err(new Error(`Unknown group '${group}'. Available groups: ${ids}`));
        }

        if (!item) {
          return ok(JSON.stringify(matched, null, 2));
        }

        const itemLower = item.toLowerCase();
        const matchedItem = matched.items.find(i => i.id.toLowerCase() === itemLower);
        if (!matchedItem) {
          const ids = matched.items.map(i => i.id).join(", ");
          return err(new Error(`Unknown item '${item}' in group '${group}'. Available items: ${ids}`));
        }

        return ok(JSON.stringify(matchedItem, null, 2));
      } catch (e) {
        return err(e);
      }
    }
  );
};

export { registerDescribeDevice };
