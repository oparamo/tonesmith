const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

const err = (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
};

export { ok, err };
