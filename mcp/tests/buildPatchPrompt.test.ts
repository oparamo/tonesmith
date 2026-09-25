import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { registry } from "@tonesmith/core";
import { buildServer } from "../src/server";

const connect = async (): Promise<{ client: Client; close: () => Promise<void> }> => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await buildServer().connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: () => client.close() };
};

describe("build_patch prompt", () => {
  let close: () => Promise<void> = async () => { /* set per test */ };
  afterEach(async () => { await close(); });

  it("is listed with the three arguments it takes", async () => {
    const connected = await connect();
    close = connected.close;

    const { prompts } = await connected.client.listPrompts();
    const prompt = prompts.find(candidate => candidate.name === "build_patch");

    expect(prompt?.arguments?.map(argument => argument.name).sort()).toEqual(["description", "device", "outPath"]);
  });

  it("carries every argument it was given into the request", async () => {
    const connected = await connect();
    close = connected.close;
    const args = { device: "gx1", description: "glassy clean with a slow chorus", outPath: "/tmp/cleans.tsl" };

    const { messages } = await connected.client.getPrompt({ name: "build_patch", arguments: args });
    const [message] = messages;
    const text = message?.content.type === "text" ? message.content.text : "";

    for (const value of Object.values(args)) expect(text).toContain(value);
  });

  it("completes the device from the registered ids", async () => {
    const connected = await connect();
    close = connected.close;
    const ids = registry.listDrivers().map(driver => driver.id);

    const { completion } = await connected.client.complete({
      ref: { type: "ref/prompt", name: "build_patch" },
      argument: { name: "device", value: "" },
    });

    expect(completion.values).toEqual(ids);
  });
});
