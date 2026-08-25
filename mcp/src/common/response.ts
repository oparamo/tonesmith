import { messageOf } from "./errors";

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

const err = (error: unknown) => ({
  content: [{ type: "text" as const, text: `Error: ${messageOf(error)}` }],
  isError: true as const,
});

/** What a tool hands back, either way. */
type ToolResponse = ReturnType<typeof ok> | ReturnType<typeof err>;

export { ok, err };
export type { ToolResponse };
