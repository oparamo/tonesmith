import { McpServer } from "@modelcontextprotocol/server";
import {
  registerListDevices,
  registerReadPatch,
  registerWriteField,
  registerDescribeDevice,
} from "./tools";
import { deviceTools } from "./devices";
import packageJson from "../package.json" with { type: "json" };

const buildServer = (): McpServer => {
  const server = new McpServer({ name: "@tonesmith/mcp", version: packageJson.version });

  registerListDevices(server);
  registerReadPatch(server);
  registerWriteField(server);
  registerDescribeDevice(server);

  for (const registerTools of deviceTools) {
    registerTools(server);
  }

  return server;
};

export { buildServer };
