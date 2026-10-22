import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { withFileLock } from "../../src/persistence/fileLock";

/** A promise this test opens itself, so ordering between two locked calls needs no timer or sleep. */
const gate = (): { promise: Promise<void>; open: () => void } => {
  let open!: () => void;
  const promise = new Promise<void>((res) => { open = res; });
  return { promise, open };
};

describe("withFileLock", () => {
  it("returns what work resolved to", async () => {
    const result = await withFileLock("a.tsl", () => Promise.resolve("done"));

    expect(result).toBe("done");
  });

  it("rejects with what work rejected with", async () => {
    const attempt = withFileLock("a.tsl", () => Promise.reject(new Error("boom")));

    await expect(attempt).rejects.toThrow("boom");
  });

  it("a second call on the same path starts only after the first settles", async () => {
    const path = "b.tsl";
    const order: string[] = [];
    const first = gate();

    const firstCall = withFileLock(path, async () => {
      order.push("first-start");
      await first.promise;
      order.push("first-end");
    });
    const secondCall = withFileLock(path, () => {
      order.push("second-start");
      return Promise.resolve();
    });

    first.open();
    await Promise.all([firstCall, secondCall]);

    expect(order).toStrictEqual(["first-start", "first-end", "second-start"]);
  });

  it("calls on different paths run concurrently, so the second starts while the first is pending", async () => {
    const order: string[] = [];
    const first = gate();

    const firstCall = withFileLock("c.tsl", async () => {
      order.push("first-start");
      await first.promise;
      order.push("first-end");
    });
    const secondCall = withFileLock("d.tsl", () => {
      order.push("second-start");
      return Promise.resolve();
    });

    await secondCall;
    expect(order, "the second finished without waiting on the first").toStrictEqual(["first-start", "second-start"]);

    first.open();
    await firstCall;
  });

  it("queues a relative path and its absolute spelling behind each other", async () => {
    const order: string[] = [];
    const first = gate();

    const firstCall = withFileLock("e.tsl", async () => {
      order.push("first-start");
      await first.promise;
      order.push("first-end");
    });
    const secondCall = withFileLock(resolve("e.tsl"), () => {
      order.push("second-start");
      return Promise.resolve();
    });

    first.open();
    await Promise.all([firstCall, secondCall]);

    expect(order).toStrictEqual(["first-start", "first-end", "second-start"]);
  });

  it("still runs a queued call after the one ahead of it rejects", async () => {
    const path = "f.tsl";

    const failing = withFileLock(path, () => Promise.reject(new Error("first failed")));
    const queued = withFileLock(path, () => Promise.resolve("second landed"));

    await expect(failing).rejects.toThrow("first failed");
    await expect(queued).resolves.toBe("second landed");
  });

  it("a call made after the queue drains starts immediately", async () => {
    const path = "g.tsl";
    await withFileLock(path, () => Promise.resolve("first"));

    const order: string[] = [];
    await withFileLock(path, () => {
      order.push("second");
      return Promise.resolve();
    });

    expect(order).toStrictEqual(["second"]);
  });
});
