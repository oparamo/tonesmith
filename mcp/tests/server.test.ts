import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { buildServer } from "../src/server";

/** Connects a fresh in-process server + client pair and returns the connected client. */
const connect = async (): Promise<{ client: Client; close: () => Promise<void> }> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const server = buildServer();

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, close: () => client.close() };
};

describe("server instructions", () => {
  let close: () => Promise<void> = async () => { /* set per test */ };
  afterEach(async () => { await close(); });

  it("advertises onboarding instructions to the client at initialize", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions();
    expect(instructions, "the server should advertise instructions").toBeTypeOf("string");
  });

  // Derived from the live tool roster rather than a hardcoded list: if a tool is renamed, added, or
  // removed, the instructions have to keep up.
  it("accounts for every registered tool", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    const { tools } = await client.listTools();

    for (const { name } of tools) {
      expect(instructions, `instructions should account for the ${name} tool`).toContain(name);
    }
  });

  it("stays device-agnostic, with no device-specific tokens leaking in", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    for (const token of ["gx1", "GX-1", "BOSS", ".tsl"]) {
      expect(instructions, `instructions should not name device-specific token ${token}`).not.toContain(token);
    }
  });
});

describe("tool registrations", () => {
  let close: () => Promise<void> = async () => { /* set per test */ };
  afterEach(async () => { await close(); });

  // These sit in the client's context on every request, so a device named here is a cost every
  // device pays, and a caller reading one device's ids as the universal set is how they mislead.
  it("keep device-specific tokens out of every tool definition", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const { tools } = await client.listTools();

    for (const tool of tools) {
      const definition = JSON.stringify(tool);
      for (const token of ["gx1", "GX-1", "BOSS", ".tsl"]) {
        expect(definition, `${tool.name} should not name device-specific token ${token}`).not.toContain(token);
      }
    }
  });

  // Without these a client has to guess from the name whether a call reads or writes, which is
  // what its approval rules are built on.
  it("say whether each tool reads or writes, and that none of them reach the network", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const { tools } = await client.listTools();
    const annotationsOf = (name: string): Record<string, unknown> =>
      tools.find(tool => tool.name === name)?.annotations ?? {};

    for (const name of ["list_devices", "read_patch", "describe_device"]) {
      expect(annotationsOf(name).readOnlyHint, `${name} only reads`).toBe(true);
    }
    for (const name of ["write_fields", "copy_patch", "generate_patch"]) {
      expect(annotationsOf(name).readOnlyHint, `${name} writes`).toBe(false);
      expect(annotationsOf(name).destructiveHint, `${name} can replace what is there`).toBe(true);
    }
    expect(annotationsOf("create_patch_file").destructiveHint, "it refuses an existing file").toBe(false);
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint, `${tool.name} touches no network`).toBe(false);
    }
  });
});
