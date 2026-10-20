/**
 * Terminal implementation of Pi's AuthInteraction contract.
 *
 * Pi's ModelRuntime.login() drives the provider login flow and calls back into
 * an AuthInteraction for anything that needs the user: prompts (text/secret/
 * select/manual_code) and notifications (info/auth_url/device_code/progress).
 *
 * The TUI implements this with dialog components; we implement it with the
 * shared Prompter and console output so pi-shell needs no TUI.
 *
 * Stage 1 focuses on API-key providers, which in practice use `secret` and
 * `select` prompts. The OAuth notify events (auth_url/device_code) and
 * manual_code prompts are implemented defensively so Stage 2 (OAuth
 * subscriptions) has a working baseline, but they are not yet tested live.
 */
import type { AuthEvent, AuthInteraction, AuthPrompt } from "@earendil-works/pi-ai";
import { EOF, type Prompter } from "./prompter.ts";

/** Thrown when the user cancels a login prompt (EOF / Ctrl+D). */
export class AuthCancelled extends Error {
  constructor() {
    super("login cancelled");
    this.name = "AuthCancelled";
  }
}

/** Present a numbered menu and return the selected option id. */
async function select(
  prompter: Prompter,
  message: string,
  options: readonly { id: string; label: string; description?: string }[],
): Promise<string> {
  console.log(message);
  options.forEach((opt, i) => {
    const desc = opt.description ? ` — ${opt.description}` : "";
    console.log(`  ${i + 1}) ${opt.label}${desc}`);
  });
  for (;;) {
    const raw = await prompter.ask(`select [1-${options.length}]: `);
    if (raw === EOF) throw new AuthCancelled();
    const n = Number.parseInt(raw, 10);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      return options[n - 1]!.id;
    }
    // Also accept a direct id match.
    const byId = options.find((o) => o.id === raw);
    if (byId) return byId.id;
    console.log("invalid selection, try again");
  }
}

/**
 * Create an AuthInteraction backed by the shared terminal prompter.
 *
 * @param prompter Shared terminal prompter owned by the main loop.
 * @param signal   Aborts the whole login flow (e.g. on Ctrl+C).
 */
export function createTerminalAuthInteraction(
  prompter: Prompter,
  signal?: AbortSignal,
): AuthInteraction {
  return {
    signal,

    async prompt(prompt: AuthPrompt): Promise<string> {
      let answer: string | typeof EOF;
      switch (prompt.type) {
        case "text":
          answer = await prompter.ask(`${prompt.message} `);
          break;
        case "secret":
          answer = await prompter.askSecret(`${prompt.message} `);
          break;
        case "select":
          return select(prompter, prompt.message, prompt.options);
        case "manual_code":
          // Headless OAuth fallback: user pastes the code/redirect URL.
          answer = await prompter.ask(`${prompt.message} `);
          break;
        default: {
          // Exhaustiveness guard: if Pi adds a prompt type, fail loudly.
          const unknown = prompt as { type: string };
          throw new Error(`unsupported auth prompt type: ${unknown.type}`);
        }
      }
      if (answer === EOF) throw new AuthCancelled();
      return answer;
    },

    notify(event: AuthEvent): void {
      switch (event.type) {
        case "info":
          console.log(event.message);
          for (const link of event.links ?? []) {
            console.log(`  ${link.label ? `${link.label}: ` : ""}${link.url}`);
          }
          break;
        case "auth_url":
          console.log("\nOpen this URL in your browser to continue sign-in:");
          console.log(`  ${event.url}`);
          if (event.instructions) console.log(event.instructions);
          break;
        case "device_code":
          console.log("\nDevice sign-in:");
          console.log(`  1. Visit: ${event.verificationUri}`);
          console.log(`  2. Enter code: ${event.userCode}`);
          if (event.expiresInSeconds) {
            console.log(`  (expires in ${event.expiresInSeconds}s)`);
          }
          break;
        case "progress":
          console.log(event.message);
          break;
        default: {
          const unknown = event as { type: string };
          console.log(`[auth] ${unknown.type}`);
        }
      }
    },
  };
}
