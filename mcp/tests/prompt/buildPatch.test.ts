import { describe, it, expect, afterEach } from "vitest";
import { registry } from "@tonesmith/core";
import { connectClient, FAKE_DEVICE_ID } from "../helpers";

describe("build_patch prompt", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  it("is listed with the three arguments it takes", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    const { prompts } = await client.listPrompts();
    const prompt = prompts.find(candidate => candidate.name === "build_patch");

    expect(prompt?.arguments?.map(argument => argument.name).sort()).toStrictEqual(["description", "device", "outPath"]);
  });

  it("carries every argument it was given into the request", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;
    const args = { device: FAKE_DEVICE_ID, description: "glassy clean with a slow chorus", outPath: "/tmp/cleans.tsl" };

    const { messages } = await client.getPrompt({ name: "build_patch", arguments: args });
    const [message] = messages;
    const text = message?.content.type === "text" ? message.content.text : "";

    expect(Object.values(args).filter(value => !text.includes(value))).toStrictEqual([]);
  });

  it("completes the device from the registered ids", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;
    const ids = registry.listDrivers().map(driver => driver.id);

    const { completion } = await client.complete({
      ref: { type: "ref/prompt", name: "build_patch" },
      argument: { name: "device", value: "" },
    });

    expect(completion.values).toStrictEqual(ids);
  });

  it("completes only the ids that start with what has been typed so far", async () => {
    const { client, close: cleanup } = await connectClient();
    close = cleanup;

    const matching = await client.complete({
      ref: { type: "ref/prompt", name: "build_patch" },
      argument: { name: "device", value: FAKE_DEVICE_ID.slice(0, 2) },
    });
    const none = await client.complete({
      ref: { type: "ref/prompt", name: "build_patch" },
      argument: { name: "device", value: "no-such-prefix" },
    });

    expect(matching.completion.values).toStrictEqual([FAKE_DEVICE_ID]);
    expect(none.completion.values).toStrictEqual([]);
  });
});
