#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerListDevices,
  registerReadPatch,
  registerGeneratePatch,
  registerWriteField,
  registerDescribeDevice,
} from "./tools/index.js";

const server = new McpServer({ name: "@tonesmith/mcp", version: "0.1.0" });

registerListDevices(server);
registerReadPatch(server);
registerGeneratePatch(server);
registerWriteField(server);
registerDescribeDevice(server);

const transport = new StdioServerTransport();
await server.connect(transport);
