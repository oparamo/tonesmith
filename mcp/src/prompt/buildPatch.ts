import type { McpServer } from "@modelcontextprotocol/server";
import { completable } from "@modelcontextprotocol/server";
import { z } from "zod";
import { registry } from "@tonesmith/core";
import { deviceField } from "../common";

/** Every registered device id that starts with what has been typed so far. */
const deviceIdsFrom = (typed: string): string[] =>
  registry.listDrivers().map(driver => driver.id).filter(id => id.startsWith(typed));

/**
 * A person's entry point to the workflow the server instructions already describe for an agent: the
 * prompt states the request and leaves the how to those instructions, so the two can't disagree.
 */
const registerBuildPatch = (server: McpServer): void => {
  server.registerPrompt(
    "build_patch",
    {
      title: "Build a patch",
      description: "Describe a tone and where to save it, and have it built as a patch for your device.",
      argsSchema: z.object({
        // A copy, since `completable` marks the schema it is handed, and the shared field is every tool's.
        device: completable(deviceField.clone(), deviceIdsFrom),
        description: z.string().describe("The tone you want, in your own words: a song, a player, a sound."),
        outPath: z.string().describe("Patch file to save it in. Created if missing; a same-named patch is replaced."),
      }),
    },
    ({ device, description, outPath }) => ({
      messages: [{
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Build a ${device} patch for this tone and save it to ${outPath}: ${description}`,
        },
      }],
    })
  );
};

export { registerBuildPatch };
