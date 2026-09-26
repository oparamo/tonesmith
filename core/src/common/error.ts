/**
 * The message carried by anything thrown. A throw can be any value: an Error gives its message
 * without the "Error: " prefix `String()` would add, and anything else is stringified.
 */
const messageOf = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message;
};

export { messageOf };
