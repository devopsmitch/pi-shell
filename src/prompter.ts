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

/** Returned by ask()/askSecret() when input reaches end-of-file (Ctrl+D / pipe EOF). */
export const EOF = Symbol("eof");

export interface Prompter {
  /** Read a line of input after printing `message`. EOF resolves to the EOF symbol. */
  ask(message: string): Promise<string | typeof EOF>;
  /** Read a line without echoing typed characters (for secrets). */
  askSecret(message: string): Promise<string | typeof EOF>;
  /** The underlying interface, for SIGINT handling. */
  readonly rl: readline.Interface;
  /** True once stdin has reached EOF or the interface was closed. */
  readonly closed: boolean;
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
  rl.on("close", () => {
    closed = true;
  });

  async function readLine(message: string): Promise<string | typeof EOF> {
    if (closed) return EOF;
    try {
      return (await rl.question(message)).trim();
    } catch (err) {
      // readline throws ERR_USE_AFTER_CLOSE if the stream closed mid-question.
      if (closed || (err as NodeJS.ErrnoException)?.code === "ERR_USE_AFTER_CLOSE") {
        return EOF;
      }
      throw err;
    }
  }

  return {
    rl,

    get closed() {
      return closed;
    },

    ask(message: string): Promise<string | typeof EOF> {
      return readLine(message);
    },

    async askSecret(message: string): Promise<string | typeof EOF> {
      if (closed) return EOF;
      // Mask typed characters by overriding how readline echoes input.
      const masked = rl as unknown as { _writeToOutput?: (s: string) => void };
      const original = masked._writeToOutput?.bind(rl);
      if (isTTY) {
        masked._writeToOutput = (s: string) => {
          // Let the prompt text and control sequences (newline/return) through;
          // suppress ordinary typed characters so the secret is not echoed.
          if (s === message || s.includes("\n") || s.includes("\r")) {
            original?.(s);
          }
        };
      }
      try {
        const answer = await rl.question(message);
        if (isTTY) stdout.write("\n");
        return answer;
      } catch (err) {
        if (closed || (err as NodeJS.ErrnoException)?.code === "ERR_USE_AFTER_CLOSE") {
          return EOF;
        }
        throw err;
      } finally {
        if (isTTY) masked._writeToOutput = original;
      }
    },

    close(): void {
      closed = true;
      rl.close();
    },
  };
}
