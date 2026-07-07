import { describe, it, expect } from "vitest";
import type { PatchDriver } from "../src/types";
import { registerDriver, getDriver, listDrivers } from "../src/registry";

const makeDriver = (id: string): PatchDriver =>
  ({ id, name: `Driver ${id}` }) as unknown as PatchDriver;

describe("registerDriver / getDriver / listDrivers", () => {
  it("registers a driver and retrieves it by id", () => {
    const registered = makeDriver("test-reg-a");
    registerDriver(registered);
    expect(getDriver("test-reg-a")).toBe(registered);
  });

  it("overwrites a driver registered under the same id", () => {
    const first  = makeDriver("test-reg-b");
    const second = makeDriver("test-reg-b");
    registerDriver(first);
    registerDriver(second);
    expect(getDriver("test-reg-b")).toBe(second);
  });

  it("listDrivers includes all registered drivers", () => {
    const first  = makeDriver("test-list-1");
    const second = makeDriver("test-list-2");
    registerDriver(first);
    registerDriver(second);
    const ids = listDrivers().map(driver => driver.id);
    expect(ids).toContain("test-list-1");
    expect(ids).toContain("test-list-2");
  });

  it("listDrivers returns an array", () => {
    expect(Array.isArray(listDrivers())).toBe(true);
  });

  it("throws a descriptive error listing registered ids for an unregistered id", () => {
    const registered = makeDriver("test-reg-listed");
    registerDriver(registered);
    expect(() => getDriver("__no_such_device__")).toThrow(/Unknown device "__no_such_device__"\. Registered devices:.*test-reg-listed/);
  });
});
