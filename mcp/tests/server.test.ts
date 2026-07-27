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

  it("walks the client through the discover → describe → generate → inspect flow", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    for (const tool of ["list_devices", "describe_device", "generate_<device>_patch", "read_patch", "write_fields"]) {
      expect(instructions, `instructions should mention ${tool}`).toContain(tool);
    }
  });

  it("directs the client to learn the signal chain first", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    expect(instructions, "instructions should surface the chain as an early step").toMatch(/describe_device <device> chain/);
  });

  it("stays device-agnostic — no device-specific tokens leak in", async () => {
    const { client, close: cleanup } = await connect();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    for (const token of ["gx1", "GX-1", "BOSS", ".tsl"]) {
      expect(instructions, `instructions should not name device-specific token ${token}`).not.toContain(token);
    }
  });
});
