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
import { createPrompter, EOF, type Prompter } from "./prompter.ts";

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

/**
 * Mutable shell state shared with command handlers. `session` can be swapped
 * (e.g. by /new), so handlers read it through this object rather than closing
 * over a value.
 */
interface ShellContext {
  session: AgentSession;
  prompter: Prompter;
  /** Replace the active session (disposes the old one and rewires streaming). */
  replaceSession(next: AgentSession): void;
}

/** A locally-handled slash command. Returning "exit" stops the REPL. */
interface Command {
  name: string;
  aliases?: string[];
  /** Argument placeholder shown in help, e.g. "[provider]". */
  usage?: string;
  description: string;
  run(ctx: ShellContext, arg: string): void | "exit" | Promise<void | "exit">;
}

const COMMANDS: readonly Command[] = [
  {
    name: "login",
    usage: "[provider]",
    description: "sign in to a provider (API key)",
    run: (ctx, arg) => loginCommand(ctx.session, ctx.prompter, arg),
  },
  {
    name: "logout",
    usage: "[provider]",
    description: "remove a stored credential",
    run: (ctx, arg) => logoutCommand(ctx.session, ctx.prompter, arg),
  },
  {
    name: "auth",
    description: "show credential/auth status",
    run: (ctx) => authStatusCommand(ctx.session),
  },
  {
    name: "model",
    usage: "[query]",
    description: "list models, or switch to a match",
    run: (ctx, arg) => modelCommand(ctx.session, arg),
  },
  {
    name: "new",
    description: "start a fresh session",
    run: async (ctx) => {
      const { session } = await createAgentSession({
        sessionManager: SessionManager.create(process.cwd()),
      });
      ctx.replaceSession(session);
      console.log("started a new session\n");
    },
  },
  {
    name: "help",
    description: "show this help",
    run: () => printHelp(),
  },
  {
    name: "exit",
    aliases: ["quit"],
    description: "leave",
    run: () => "exit",
  },
];

/** Resolve a typed command name (or alias) to its definition. */
function findCommand(name: string): Command | undefined {
  return COMMANDS.find((c) => c.name === name || c.aliases?.includes(name));
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
  // Derived from COMMANDS so help can never drift from the dispatch table.
  const left = (c: Command): string =>
    `/${[c.name, ...(c.aliases ?? [])].join(", /")}${c.usage ? ` ${c.usage}` : ""}`;
  const width = Math.max(...COMMANDS.map((c) => left(c).length));
  console.log("commands:");
  for (const c of COMMANDS) {
    console.log(`  ${left(c).padEnd(width)}  ${c.description}`);
  }
  console.log("anything else is sent to the agent.\n");
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  let session = (
    await createAgentSession({ sessionManager: makeSessionManager(opts) })
  ).session;
  let unsubscribe = streamAssistantText(session);

  printBanner(session, opts);

  const prompter = createPrompter();

  const ctx: ShellContext = {
    session,
    prompter,
    replaceSession(next: AgentSession): void {
      unsubscribe();
      session.dispose();
      session = next;
      ctx.session = next;
      unsubscribe = streamAssistantText(next);
    },
  };

  // Ctrl+C behaviour:
  //  - while a turn is running (busy): interrupt the turn, keep the shell open.
  //  - while idle at the prompt: cancel the prompt, which exits the loop.
  let busy = false;
  prompter.rl.on("SIGINT", () => {
    if (busy) {
      void ctx.session.abort();
      stdout.write("\n(interrupted)\n");
    } else {
      stdout.write("\n");
      prompter.cancel();
    }
  });

  try {
    for (;;) {
      const line = await prompter.ask(PROMPT);
      if (line === EOF) break;
      if (!line) continue;

      // Locally handled slash commands (pi-shell owns these so no TUI is
      // needed). A leading "/" with a known name dispatches here; anything
      // else (including unknown /names) goes to the agent.
      if (line.startsWith("/")) {
        const [name, ...rest] = line.slice(1).split(/\s+/);
        const command = findCommand(name ?? "");
        if (command) {
          if ((await command.run(ctx, rest.join(" "))) === "exit") break;
          continue;
        }
      }

      // Everything else goes to Pi. prompt() also handles Pi's own
      // slash-commands and prompt-template expansion.
      busy = true;
      try {
        await ctx.session.prompt(line);
        stdout.write("\n");
      } catch (err) {
        console.error(
          `\nerror: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        busy = false;
      }
    }
  } finally {
    unsubscribe();
    ctx.session.dispose();
    prompter.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
