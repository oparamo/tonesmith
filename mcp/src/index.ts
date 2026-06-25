#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  registerListDevices,
  registerReadPatch,
  registerGeneratePatch,
  registerWriteField,
  registerDescribeDevice,
} from "./tools";

const server = new McpServer({ name: "@tonesmith/mcp", version: "0.1.0" });

registerListDevices(server);
registerReadPatch(server);
registerGeneratePatch(server);
registerWriteField(server);
registerDescribeDevice(server);

const transport = new StdioServerTransport();
await server.connect(transport);
