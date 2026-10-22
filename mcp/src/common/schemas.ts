import { z } from "zod";

/**
 * The device argument every tool takes. One shared field rather than a copy per tool, because a
 * copy is free to drift, and this schema sits in the client's context on every request: a
 * device-specific example landing in one copy is a cost every device pays.
 */
const deviceField = z.string().describe("Device ID. Use list_devices to enumerate IDs.");

export { deviceField };
