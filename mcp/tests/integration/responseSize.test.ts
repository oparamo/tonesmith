/**
 * Response-size budgets against a real client ceiling. The shapes they check are describeDevice's
 * own, but the byte counts belong to gx1's catalog, so a catalog change can fail these with mcp
 * unchanged; that is why they sit here rather than in the unit suite.
 */
import { describe, it, expect, afterEach } from "vitest";
import { connectClient } from "../helpers";

describe("describe_device response size", () => {
  let close: () => Promise<void>;
  afterEach(async () => { await close(); });

  // The listing exists to be read in one call, and inlining every type's params pushes fx past 70k
  // characters, which some clients refuse outright.
  it("keeps the largest group's index under the budget", async () => {
    const client = await connectClient();
    close = client.close;

    const listing = await client.callTool("describe_device", { device: "gx1", items: ["fx"] });

    expect(listing.isError, listing.text).toBe(false);
    expect(listing.text.length, "an fx listing must stay browsable").toBeLessThan(20_000);
  });

  // A client persists any tool result over 25,000 tokens to a file, then refuses to read that file
  // back for exceeding the same limit, so an oversized response is not merely verbose, it is
  // unrecoverable. These 30 entries are a whole library's worth of lookups, the scale the server's
  // instructions tell agents to batch for. The budget is in bytes because the token count is a
  // client-side measure this suite cannot see; 45 KB stays under 25k tokens at any plausible ratio.
  it("keeps a library-scale batch under the client's response ceiling", async () => {
    const client = await connectClient();
    close = client.close;
    const items = [
      "chain", "amp", "drive",
      "fx/COMPRESSOR", "fx/ENHANCER", "fx/HIGH GEQ", "fx/CHORUS", "fx/ROTARY", "fx/SCRIPT PH",
      "fx/FLANGER", "fx/PHASER", "fx/TREMOLO", "fx/CLASSIC-VIBE", "fx/VIBRATO",
      "drive/MUFF FUZZ", "drive/60S FUZZ", "drive/BLUES OD", "drive/T-SCREAM", "drive/TREBLE BST",
      "drive/LEAD DS",
      "delay/ANALOG", "delay/STANDARD", "delay/MODULATE",
      "reverb/HALL M", "reverb/HALL S", "reverb/ROOM S", "reverb/PLATE", "reverb/SHIMMER",
      "noiseGate", "volume",
    ];

    const { text, isError } = await client.callTool("describe_device", { device: "gx1", items });

    expect(isError, text).toBe(false);
    expect(text.length, "a whole library's lookups must fit in one response").toBeLessThan(45_000);
  });
});
