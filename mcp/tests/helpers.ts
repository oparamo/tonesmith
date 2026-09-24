import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gx1, patchUtils } from "@tonesmith/core";
import { buildServer } from "../src/server";

const FIXTURE = join(import.meta.dirname, "../../fixtures/gx1/rock-tones.tsl");

/** A scratch dir with the rock-tones fixture copied in, for tools that write files. */
const withTempDir = async (): Promise<{ dir: string; fixture: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-mcp-"));
  const fixture = join(dir, "rock-tones.tsl");
  await copyFile(FIXTURE, fixture);
  return { dir, fixture, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

/** An empty scratch dir, for tools that create new files from scratch. */
const emptyTempDir = async (): Promise<{ dir: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(join(tmpdir(), "tonesmith-mcp-"));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

/**
 * A value the test has already established is there: the patch a tool just wrote, the entry a
 * response just reported. Failing here says which one was missing, where the alternative is a
 * cascade of assertions against `undefined`.
 */
const present = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`Expected ${what}, got nothing`);
  return value;
};

/** Whether a path exists. Only a missing file answers no; any other failure is rethrown. */
const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return false;
  }
};

/** The patch at `index` of the file at `path`, read back through the driver. */
const patchAt = async (path: string, index = 0): Promise<gx1.Patch> => {
  const file = await patchUtils.readPatchFile(gx1.driver, path);
  return present(file.patches[index], `patch ${index} of ${path}`);
};

interface ToolResult {
  text: string;
  isError: boolean;
}

/** Connects a fresh in-process server + client pair and returns a callTool helper
 * that extracts the single text content block from the result. */
const connectClient = async (): Promise<{
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  getToolSchema: (name: string) => Promise<unknown>;
  close: () => Promise<void>;
}> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const server = buildServer();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const callTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const result = await client.callTool({ name, arguments: args });
    const [block] = result.content as { type: string; text: string }[];
    return { text: present(block, "a content block").text, isError: result.isError === true };
  };

  /** Fetches one tool's client-visible definition (name/description/inputSchema) by name. */
  const getToolSchema = async (name: string): Promise<unknown> => {
    const { tools } = await client.listTools();
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) throw new Error(`No tool registered named "${name}"`);
    return tool;
  };

  const close = async (): Promise<void> => {
    await client.close();
  };

  return { callTool, getToolSchema, close };
};

export { connectClient, withTempDir, emptyTempDir, present, pathExists, patchAt, FIXTURE };
