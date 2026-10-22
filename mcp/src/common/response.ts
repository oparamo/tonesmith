const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

type ToolResponse = ReturnType<typeof ok>;

export { ok };
export type { ToolResponse };
