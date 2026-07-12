import { describe, it, expect } from "vitest";
import { ok, err } from "../src/common/response";

describe("ok", () => {
  it("wraps text in a single text content block", () => {
    const result = ok("hello");

    expect(result).toEqual({ content: [{ type: "text", text: "hello" }] });
  });
});

describe("err", () => {
  it("formats an Error instance's message", () => {
    const result = err(new Error("boom"));

    expect(result).toEqual({ content: [{ type: "text", text: "Error: boom" }], isError: true });
  });

  it("stringifies a non-Error thrown value", () => {
    const result = err("boom");

    expect(result).toEqual({ content: [{ type: "text", text: "Error: boom" }], isError: true });
  });
});
