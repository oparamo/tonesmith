import { describe, it, expect, afterEach } from "vitest";
import { registry } from "@tonesmith/core";
import packageJson from "../package.json" with { type: "json" };
import { connectClient } from "./helpers";

describe("server instructions", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("advertises onboarding instructions to the client at initialize", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    expect(instructions.length, "the server should advertise instructions").toBeGreaterThan(0);
  });

  // Derived from the live tool roster rather than a hardcoded list: if a tool is renamed, added, or
  // removed, the instructions have to keep up.
  it("accounts for every registered tool", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    const instructions = client.getInstructions() ?? "";
    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name).filter(name => !instructions.includes(name))).toStrictEqual([]);
  });

  it("reports its own package version", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    expect(client.getServerVersion()?.version).toBe(packageJson.version);
  });
});

describe("tool registrations", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  // These sit in the client's context on every request, so a device named here is a cost every
  // device pays, and a caller reading one device's ids as the universal set is how they mislead.
  it("keep device-specific tokens out of every tool definition", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    const { tools } = await client.listTools();
    const tokens = registry.listDrivers().flatMap(driver => [driver.id, driver.name]);

    const offending = tools.flatMap(tool => {
      const definition = JSON.stringify(tool);
      return tokens.filter(token => definition.includes(token)).map(token => `${tool.name}:${token}`);
    });
    expect(offending).toStrictEqual([]);
  });
});
