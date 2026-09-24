import { resolve } from "node:path";

/**
 * The settled end of each file's queue, keyed by resolved path so "./a.tsl" and its absolute
 * spelling queue behind each other. It never rejects: one caller's failure is its own answer, not a
 * reason to refuse the callers queued after it.
 */
const queueTails = new Map<string, Promise<void>>();

/**
 * Runs `work` once every earlier `work` on the same file has finished. Two read-change-writes on one
 * file that interleave (read, read, write, write) lose the first change, and agents do send
 * parallel edits to one file. The queue is per file so that calls on different files still overlap.
 *
 * Not re-entrant: `work` that waits on another locked call for the same path waits on itself.
 */
const withFileLock = async <T>(path: string, work: () => Promise<T>): Promise<T> => {
  const key = resolve(path);
  const ahead = queueTails.get(key) ?? Promise.resolve();
  const result = ahead.then(work);
  const settled = result.then(() => undefined, () => undefined);
  queueTails.set(key, settled);
  try {
    return await result;
  } finally {
    // Only the last caller in the queue removes it; anyone queued since has replaced the tail.
    if (queueTails.get(key) === settled) queueTails.delete(key);
  }
};

export { withFileLock };
