import type { McpServer } from "@modelcontextprotocol/server";
import { registerGeneratePatch } from "./generate-patch";

const registerGx1Tools = (server: McpServer): void => {
  registerGeneratePatch(server);
};

export { registerGx1Tools };
