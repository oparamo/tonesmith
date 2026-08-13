import { z } from "zod";

/**
 * The device argument every tool takes. One shared field rather than a copy per tool: the copies
 * were identical until one drifted, and the one that drifted is where a device-specific example
 * ended up in the schema every request carries.
 */
const deviceField = z.string().describe("Device ID. Use list_devices to enumerate IDs.");

export { deviceField };
