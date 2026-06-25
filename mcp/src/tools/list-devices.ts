import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registry } from "@tonesmith/core";
import { ok } from "../common/index";

const registerListDevices = (server: McpServer): void => {
  server.registerTool(
    "list_devices",
    { description: "List all supported guitar processor devices and their IDs." },
    async () => ok(JSON.stringify(registry.listDrivers().map(d => ({ id: d.id, name: d.name })), null, 2))
  );
};

export { registerListDevices };
