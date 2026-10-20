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
import { stdout } from "node:process";
import {
  authStatusCommand,
  loginCommand,
  logoutCommand,
  modelCommand,
  modelLabel,
} from "./commands.ts";
import { createPrompter, EOF } from "./prompter.ts";

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
  const model = modelLabel(session.model);
  console.log("pi-shell — minimal Pi interface");
  console.log(`session: ${mode}`);
  console.log(`model:   ${model}`);
  console.log("type /help for commands\n");
}

function printHelp(): void {
  console.log("commands:");
  console.log("  /login [provider]   sign in to a provider (API key)");
  console.log("  /logout [provider]  remove a stored credential");
  console.log("  /auth               show credential/auth status");
  console.log("  /model [query]      list models, or switch to a match");
  console.log("  /new                start a fresh session");
  console.log("  /help               show this help");
  console.log("  /exit, /quit        leave");
  console.log("anything else is sent to the agent.\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  let { session } = await createAgentSession({
    sessionManager: makeSessionManager(opts),
  });
  let unsubscribe = streamAssistantText(session);

  printBanner(session, opts);

  const prompter = createPrompter();

  // Ctrl+C: abort the active turn if one is running; otherwise exit cleanly.
  let exiting = false;
  prompter.rl.on("SIGINT", () => {
    void (async () => {
      try {
        await session.abort();
        stdout.write("\n(interrupted)\n");
        prompter.rl.prompt();
      } catch {
        exiting = true;
        prompter.close();
      }
    })();
  });

  try {
    for (;;) {
      const line = await prompter.ask(PROMPT);
      if (exiting || line === EOF) break;
      if (!line) continue;

      // Split a leading /command from its argument.
      const isCommand = line.startsWith("/");
      const [cmd, ...rest] = isCommand ? line.slice(1).split(/\s+/) : [];
      const arg = rest.join(" ");

      // Locally handled commands (pi-shell owns these so no TUI is needed).
      if (cmd === "exit" || cmd === "quit") break;
      if (cmd === "help") {
        printHelp();
        continue;
      }
      if (cmd === "new") {
        unsubscribe();
        session.dispose();
        ({ session } = await createAgentSession({
          sessionManager: SessionManager.create(process.cwd()),
        }));
        unsubscribe = streamAssistantText(session);
        console.log("started a new session\n");
        continue;
      }
      if (cmd === "login") {
        await loginCommand(session, prompter, arg);
        continue;
      }
      if (cmd === "logout") {
        await logoutCommand(session, prompter, arg);
        continue;
      }
      if (cmd === "auth") {
        await authStatusCommand(session);
        continue;
      }
      if (cmd === "model") {
        await modelCommand(session, arg);
        continue;
      }

      // Everything else goes to Pi. prompt() also handles Pi's own
      // slash-commands and prompt-template expansion.
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
    prompter.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
