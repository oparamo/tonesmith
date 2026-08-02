import { describe, it, expect } from "vitest";
import type { PatchDriver } from "../src/types";
import { registerDriver, getDriver, listDrivers } from "../src/registry";

const makeDriver = (id: string): PatchDriver =>
  ({ id, name: `Driver ${id}` }) as unknown as PatchDriver;

describe("registerDriver / getDriver / listDrivers", () => {
  it("registers a driver and retrieves it by id", () => {
    const registered = makeDriver("test-reg-a");

    registerDriver(registered);
    const retrieved = getDriver("test-reg-a");

    expect(retrieved).toBe(registered);
  });

  it("overwrites a driver registered under the same id", () => {
    const first  = makeDriver("test-reg-b");
    const second = makeDriver("test-reg-b");

    registerDriver(first);
    registerDriver(second);
    const retrieved = getDriver("test-reg-b");

    expect(retrieved).toBe(second);
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

  it("throws a descriptive error listing registered ids for an unregistered id", () => {
    const registered = makeDriver("test-reg-listed");
    registerDriver(registered);

    const getUnregisteredDriver = () => getDriver("__no_such_device__");

    expect(getUnregisteredDriver).toThrow(/__no_such_device__/);
    expect(getUnregisteredDriver).toThrow(/test-reg-listed/);
  });
});
