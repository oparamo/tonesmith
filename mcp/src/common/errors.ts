/**
 * The message carried by anything thrown. JavaScript lets a throw be any value at all, and a tool
 * answering with "[object Object]" tells the caller nothing about what went wrong.
 */
const messageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message;
};

export { messageOf };
