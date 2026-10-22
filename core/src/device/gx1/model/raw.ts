/**
 * Carries the original raw bytes on decoded GX-1 objects: block bytes on each block, the full
 * param set on a Patch, the JSON envelope on a PatchFile.
 *
 * A symbol rather than a field name because JSON.stringify and Object.entries skip symbol keys,
 * so raw bytes stay out of CLI display output and MCP responses without any filtering.
 */
const RAW: unique symbol = Symbol("gx1.raw");

export { RAW };
