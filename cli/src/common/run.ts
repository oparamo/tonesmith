import { messageOf } from "@tonesmith/core";

/**
 * Runs one command's work, turning a throw into a printed message and a failing exit code. Setting
 * the code rather than calling process.exit lets the runtime finish flushing stdout, so a failure
 * piped into another command arrives whole.
 */
const run = async (action: () => void | Promise<void>): Promise<void> => {
  try {
    await action();
  } catch (error) {
    console.error(messageOf(error));
    process.exitCode = 1;
  }
};

export { run };
