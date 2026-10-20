/**
 * A single shared terminal prompt, owned by the main loop.
 *
 * All input (the REPL prompt, command arguments, and auth prompts) goes through
 * one readline interface. Creating separate readline interfaces on the same
 * stdin closes the shared stream and breaks subsequent reads
 * (ERR_USE_AFTER_CLOSE), so commands must reuse this instead.
 */
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Returned by ask()/askSecret() when a line cannot be read: end-of-file
 * (Ctrl+D / closed pipe) or an aborted prompt (idle Ctrl+C). Callers treat it
 * as "no input / cancel".
 */
export const EOF = Symbol("eof");

export interface Prompter {
  /** Read a line of input after printing `message`. EOF resolves to the EOF symbol. */
  ask(message: string): Promise<string | typeof EOF>;
  /** Read a line without echoing typed characters (for secrets). */
  askSecret(message: string): Promise<string | typeof EOF>;
  /** The underlying interface, for attaching SIGINT and resize listeners. */
  readonly rl: readline.Interface;
  /** True once stdin has reached EOF or the interface was closed. */
  readonly closed: boolean;
  /** True while a question is awaiting input (used to distinguish idle state). */
  readonly waiting: boolean;
  /** Abort the in-flight question, if any. The pending ask() resolves to EOF. */
  cancel(): void;
  close(): void;
}

export function createPrompter(): Prompter {
  // Only enable line-editing when attached to a real terminal. For piped or
  // redirected input, a non-terminal interface reads lines cleanly without
  // emitting cursor-control escape sequences.
  const isTTY = Boolean(stdin.isTTY);
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: isTTY,
  });

  let closed = false;
  let waiting = false;
  let controller: AbortController | undefined;

  rl.on("close", () => {
    closed = true;
  });

  function isAbortOrClose(err: unknown): boolean {
    const code = (err as NodeJS.ErrnoException)?.code;
    const name = (err as Error)?.name;
    // question() rejects with ERR_USE_AFTER_CLOSE on a closed stream, and with
    // an AbortError when its signal fires.
    return closed || code === "ERR_USE_AFTER_CLOSE" || name === "AbortError";
  }

  async function askLine(
    message: string,
    opts?: { secret?: boolean },
  ): Promise<string | typeof EOF> {
    if (closed) return EOF;

    // Mask typed characters for secrets by overriding how readline echoes
    // input. `_writeToOutput` is a Node-internal (undocumented) readline method;
    // this is the conventional masking approach and is guarded to TTY only.
    const masked = rl as unknown as { _writeToOutput?: (s: string) => void };
    const original = masked._writeToOutput?.bind(rl);
    if (opts?.secret && isTTY) {
      masked._writeToOutput = (s: string) => {
        // Let the prompt text and control sequences (newline/return) through;
        // suppress ordinary typed characters so the secret is not echoed.
        if (s === message || s.includes("\n") || s.includes("\r")) {
          original?.(s);
        }
      };
    }

    controller = new AbortController();
    waiting = true;
    try {
      const answer = await rl.question(message, { signal: controller.signal });
      if (opts?.secret && isTTY) stdout.write("\n");
      return answer.trim();
    } catch (err) {
      if (isAbortOrClose(err)) return EOF;
      throw err;
    } finally {
      waiting = false;
      controller = undefined;
      if (opts?.secret && isTTY) masked._writeToOutput = original;
    }
  }

  return {
    rl,

    get closed() {
      return closed;
    },

    get waiting() {
      return waiting;
    },

    ask(message: string): Promise<string | typeof EOF> {
      return askLine(message);
    },

    askSecret(message: string): Promise<string | typeof EOF> {
      return askLine(message, { secret: true });
    },

    cancel(): void {
      controller?.abort();
    },

    close(): void {
      closed = true;
      rl.close();
    },
  };
}
