import { McpServer } from "@modelcontextprotocol/server";
import {
  registerListDevices,
  registerReadPatch,
  registerGeneratePatch,
  registerWriteField,
  registerDescribeDevice,
} from "./tools";
import packageJson from "../package.json" with { type: "json" };

const buildServer = (): McpServer => {
  const server = new McpServer({ name: "@tonesmith/mcp", version: packageJson.version });

  registerListDevices(server);
  registerReadPatch(server);
  registerGeneratePatch(server);
  registerWriteField(server);
  registerDescribeDevice(server);

  return server;
};

export { buildServer };
