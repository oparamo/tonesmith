import { err } from "./response";
import type { ToolResponse } from "./response";

/**
 * Runs a tool's work, turning anything it throws into an error response. Every tool needs it: a
 * throw escaping a handler is a transport-level failure rather than an answer the caller can read.
 */
const attempt = async (work: () => ToolResponse | Promise<ToolResponse>): Promise<ToolResponse> => {
  try {
    return await work();
  } catch (error) {
    return err(error);
  }
};

export { attempt };
