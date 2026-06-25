/**
 * Module-level Symbol used to carry raw binary bytes on decoded GX-1 patch objects.
 *
 * Symbol-keyed properties are omitted by JSON.stringify and Object.entries, so
 * raw bytes never appear in CLI display output or MCP JSON responses — no explicit
 * filtering needed and no underscore-prefixed field names required.
 *
 * Usage across types:
 *   FxBlock / OdDsBlock / AmpBlock / NsBlock / FvBlock  →  [RAW]: number[]  (block bytes)
 *   DelayBlock / ReverbBlock                            →  [RAW]: number[]  (block bytes)
 *   gx1.Patch                                          →  [RAW]: RawParamSet (full param set)
 *   gx1.PatchFile                                      →  [RAW]: TslEnvelope (JSON envelope)
 */
const RAW: unique symbol = Symbol("gx1.raw");

export { RAW };
