const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });

const err = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
};

export { ok, err };
