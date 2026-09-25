#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { buildServer } from "./server";

const transport = new StdioServerTransport();
await buildServer().connect(transport);
