import { describe, it, expect } from "vitest";
import { validateTypeParams } from "../src/devices/gx1/validate-params";

/** Runs the validator and returns the messages it reported. */
const collect = (run: (add: (message: string) => void) => void): string[] => {
  const messages: string[] = [];
  run(message => { messages.push(message); });
  return messages;
};

describe("validateTypeParams", () => {
  it("reports nothing for an unknown group or type (defers to the builder/codec)", () => {
    const messages = collect(add => { validateTypeParams(add, "fx", "NOPE", undefined, { sustain: 200 }); });

    expect(messages).toEqual([]);
  });

  it("range-checks numeric params and ignores keys with no matching spec", () => {
    const messages = collect(add => {
      validateTypeParams(add, "fx", "COMPRESSOR", "ORANGE", { sustain: 200, attack: 50, bogus: 5 });
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("fx SUSTAIN for COMPRESSOR");
  });

  it("merges a subType's own params (delay sub-algorithm) into the checked set", () => {
    const messages = collect(add => {
      validateTypeParams(add, "fx", "DELAY", "MODULATE", { modRate: 500 });
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("MOD RATE");
  });

  it("passes valid numeric and discrete values", () => {
    const messages = collect(add => {
      validateTypeParams(add, "delay", "ANALOG", undefined, { time: 360, highCut: "2kHz" });
    });

    expect(messages).toEqual([]);
  });

  it("checks discrete-value membership", () => {
    const messages = collect(add => {
      validateTypeParams(add, "delay", "ANALOG", undefined, { highCut: "9kHz" });
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("delay HIGH CUT for ANALOG");
  });
});
