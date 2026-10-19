#!/usr/bin/env -S npx tsx
/**
 * pi-shell — a minimal shell-prompt interface for the Pi agent harness.
 *
 * No TUI. Just a `> ` prompt, clean streaming text output, and a persistent
 * session so conversation context and history carry across turns (and across
 * runs, unless started with --new or --in-memory).
 */
import {
  createAgentSession,
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const PROMPT = "> ";

interface Options {
  fresh: boolean;
  inMemory: boolean;
}

function parseArgs(argv: string[]): Options {
  const args = new Set(argv.slice(2));
  return {
    fresh: args.has("--new") || args.has("-n"),
    inMemory: args.has("--in-memory"),
  };
}

/** Choose how session history is stored based on CLI flags. */
function makeSessionManager(opts: Options): SessionManager {
  const cwd = process.cwd();
  if (opts.inMemory) return SessionManager.inMemory();
  if (opts.fresh) return SessionManager.create(cwd);
  // Default: resume the most recent session for this directory, or create one.
  return SessionManager.continueRecent(cwd);
}

/** Subscribe to streamed assistant text and write it straight to stdout. */
function streamAssistantText(session: AgentSession): () => void {
  return session.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      stdout.write(event.assistantMessageEvent.delta);
    }
  });
}

function printBanner(session: AgentSession, opts: Options): void {
  const mode = opts.inMemory
    ? "in-memory (not saved)"
    : (session.sessionFile ?? "new session");
  console.log("pi-shell — minimal Pi interface");
  console.log(`session: ${mode}`);
  console.log("commands: /new  /exit  (and Pi commands like /model)\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  let { session } = await createAgentSession({
    sessionManager: makeSessionManager(opts),
  });
  let unsubscribe = streamAssistantText(session);

  printBanner(session, opts);

  const rl = readline.createInterface({ input: stdin, output: stdout });

  // Ctrl+C: abort the active turn if one is running; otherwise exit cleanly.
  let exiting = false;
  rl.on("SIGINT", () => {
    void (async () => {
      try {
        await session.abort();
        stdout.write("\n(interrupted)\n");
        rl.prompt();
      } catch {
        exiting = true;
        rl.close();
      }
    })();
  });

  try {
    for (;;) {
      const line = (await rl.question(PROMPT)).trim();
      if (exiting) break;
      if (!line) continue;

      // Locally handled commands.
      if (line === "/exit" || line === "/quit") break;
      if (line === "/new") {
        unsubscribe();
        session.dispose();
        ({ session } = await createAgentSession({
          sessionManager: SessionManager.create(process.cwd()),
        }));
        unsubscribe = streamAssistantText(session);
        console.log("started a new session\n");
        continue;
      }

      // Everything else goes to Pi. prompt() also handles Pi's own
      // slash-commands (e.g. /model) and prompt-template expansion.
      try {
        await session.prompt(line);
        stdout.write("\n");
      } catch (err) {
        console.error(
          `\nerror: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    unsubscribe();
    session.dispose();
    rl.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
