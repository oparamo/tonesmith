import type { McpServer } from "@modelcontextprotocol/server";
import { registerGx1Tools } from "./gx1";

const deviceTools: ((server: McpServer) => void)[] = [registerGx1Tools];

export { deviceTools };
