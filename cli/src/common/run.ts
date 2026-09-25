/**
 * Runs one command's work, turning a throw into a printed message and a failing exit code. Setting
 * the code rather than calling process.exit lets the runtime finish flushing stdout, so a failure
 * piped into another command arrives whole.
 */
const run = async (action: () => void | Promise<void>): Promise<void> => {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
};

export { run };
