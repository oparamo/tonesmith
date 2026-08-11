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
