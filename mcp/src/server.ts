import { McpServer } from "@modelcontextprotocol/server";
import {
  registerListDevices,
  registerReadPatch,
  registerWriteFields,
  registerDescribeDevice,
  registerCopyPatch,
  registerCreatePatchFile,
  registerGeneratePatch,
} from "./tools";
import { instructions } from "./instructions";
import packageJson from "../package.json" with { type: "json" };

const buildServer = (): McpServer => {
  const serverInfo = {
    name: "@tonesmith/mcp",
    title: "tonesmith",
    description: "Read, edit, and build guitar multi-effects processor patch files.",
    websiteUrl: "https://github.com/oparamo/tonesmith",
    version: packageJson.version,
  };
  const server = new McpServer(serverInfo, { instructions });

  registerListDevices(server);
  registerReadPatch(server);
  registerWriteFields(server);
  registerDescribeDevice(server);
  registerCopyPatch(server);
  registerCreatePatchFile(server);
  registerGeneratePatch(server);

  return server;
};

export { buildServer };
