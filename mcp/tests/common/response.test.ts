import { describe, it, expect } from "vitest";
import { ok } from "../../src/common/response";

describe("ok", () => {
  it("wraps text in a single text content block", () => {
    const result = ok("hello");

    expect(result).toStrictEqual({ content: [{ type: "text", text: "hello" }] });
  });
});
