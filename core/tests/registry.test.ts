import { describe, it, expect } from "vitest";
import type { PatchDriver } from "../src/types";
import { registerDriver, getDriver, listDrivers } from "../src/registry";

const makeDriver = (id: string): PatchDriver =>
  ({ id, name: `Driver ${id}` }) as unknown as PatchDriver;

describe("registerDriver / getDriver / listDrivers", () => {
  it("getDriver returns undefined for an unregistered id", () => {
    expect(getDriver("__no_such_device__")).toBeUndefined();
  });

  it("registers a driver and retrieves it by id", () => {
    const d = makeDriver("test-reg-a");
    registerDriver(d);
    expect(getDriver("test-reg-a")).toBe(d);
  });

  it("overwrites a driver registered under the same id", () => {
    const first  = makeDriver("test-reg-b");
    const second = makeDriver("test-reg-b");
    registerDriver(first);
    registerDriver(second);
    expect(getDriver("test-reg-b")).toBe(second);
  });

  it("listDrivers includes all registered drivers", () => {
    const d1 = makeDriver("test-list-1");
    const d2 = makeDriver("test-list-2");
    registerDriver(d1);
    registerDriver(d2);
    const ids = listDrivers().map(d => d.id);
    expect(ids).toContain("test-list-1");
    expect(ids).toContain("test-list-2");
  });

  it("listDrivers returns an array", () => {
    expect(Array.isArray(listDrivers())).toBe(true);
  });
});
