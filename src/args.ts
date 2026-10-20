/** Command-line option parsing for pi-shell. Pure and unit testable. */

export interface Options {
  /** Force a fresh persistent session (ignore the most recent one). */
  fresh: boolean;
  /** Use an ephemeral in-memory session (nothing written to disk). */
  inMemory: boolean;
}

/** Parse option flags from an argv tail (i.e. argv without node + script). */
export function parseOptions(args: readonly string[]): Options {
  const set = new Set(args);
  return {
    fresh: set.has("--new") || set.has("-n"),
    inMemory: set.has("--in-memory"),
  };
}
