/**
 * A single shared terminal prompt, owned by the main loop. All input (REPL
 * prompt, command args, auth prompts) goes through one readline interface:
 * separate interfaces on the same stdin close the shared stream and break
 * later reads (ERR_USE_AFTER_CLOSE).
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
  /** Abort the in-flight question, if any. The pending ask() resolves to EOF. */
  cancel(): void;
  close(): void;
}

export function createPrompter(): Prompter {
  // Line-editing only on a real terminal; piped input reads cleanly without
  // cursor-control escape sequences.
  const isTTY = Boolean(stdin.isTTY);
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    terminal: isTTY,
  });

  let closed = false;
  let controller: AbortController | undefined;

  rl.on("close", () => {
    closed = true;
    // A question in flight when stdin closes never settles; abort it so the
    // pending ask() resolves to EOF instead of hanging.
    controller?.abort();
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

    // Mask secrets by overriding readline's echo. `_writeToOutput` is a
    // private, undocumented method — the only way to suppress echo in
    // node:readline. Fragile across Node versions, so it's TTY-only and
    // restored in `finally`. Typed characters are hidden (no "*" shown).
    const masked = rl as unknown as { _writeToOutput?: (s: string) => void };
    const original = masked._writeToOutput?.bind(rl);
    if (opts?.secret && isTTY) {
      masked._writeToOutput = (s: string) => {
        // Let prompt text and newlines through; suppress typed characters.
        if (s === message || s.includes("\n") || s.includes("\r")) {
          original?.(s);
        }
      };
    }

    controller = new AbortController();
    try {
      const answer = await rl.question(message, { signal: controller.signal });
      if (opts?.secret && isTTY) stdout.write("\n");
      return answer.trim();
    } catch (err) {
      if (isAbortOrClose(err)) return EOF;
      throw err;
    } finally {
      controller = undefined;
      if (opts?.secret && isTTY) masked._writeToOutput = original;
    }
  }

  return {
    rl,

    get closed() {
      return closed;
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
