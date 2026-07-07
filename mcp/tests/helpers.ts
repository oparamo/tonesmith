import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "../src/server";

const FIXTURE = join(import.meta.dirname, "../../fixtures/gx1/rock-tones.tsl");

/** A scratch dir with the rock-tones fixture copied in, for tools that write files. */
const withTempDir = (): { dir: string; fixture: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), "tonesmith-mcp-"));
  const fixture = join(dir, "rock-tones.tsl");
  copyFileSync(FIXTURE, fixture);
  return { dir, fixture, cleanup: () => { rmSync(dir, { recursive: true, force: true }); } };
};

/** An empty scratch dir, for tools that create new files from scratch. */
const emptyTempDir = (): { dir: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), "tonesmith-mcp-"));
  return { dir, cleanup: () => { rmSync(dir, { recursive: true, force: true }); } };
};

interface ToolResult {
  text: string;
  isError: boolean;
}

/** Connects a fresh in-process server + client pair and returns a callTool helper
 * that extracts the single text content block from the result. */
const connectClient = async (): Promise<{
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
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
    return { text: block.text, isError: result.isError === true };
  };

  const close = async (): Promise<void> => {
    await client.close();
  };

  return { callTool, close };
};

export { connectClient, withTempDir, emptyTempDir, FIXTURE };
