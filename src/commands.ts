/**
 * Stage 1 auth/model commands for pi-shell, built on ModelRuntime.
 *
 *   /login [provider]   authenticate a provider (API key via terminal prompts)
 *   /logout [provider]  remove a stored credential
 *   /auth               show credential/auth status
 *   /model [query]      list or switch the active model
 *
 * OAuth subscription sign-in (Claude Pro, ChatGPT) is Stage 2; API-key login
 * works here for every API-key provider, and Bedrock/Gemini/OpenRouter resolve
 * via API keys or ambient credentials.
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { type Api, type AuthType, type Model } from "@earendil-works/pi-ai";
import { AuthCancelled, createTerminalAuthInteraction } from "./auth-interaction.ts";
import {
  hasRealModel,
  matchModels,
  modelLabel,
  resolveProviderChoice,
  sameModel,
} from "./model-select.ts";
import { EOF, type Prompter } from "./prompter.ts";

export { hasRealModel, modelLabel } from "./model-select.ts";

/** Providers the user commonly uses, offered as a shortlist for /login. */
const SUGGESTED_PROVIDERS: readonly { id: string; label: string; authTypes: AuthType[] }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", authTypes: ["oauth", "api_key"] },
  { id: "openai", label: "OpenAI (ChatGPT)", authTypes: ["oauth", "api_key"] },
  { id: "bedrock", label: "Amazon Bedrock", authTypes: ["api_key"] },
  { id: "gemini", label: "Google Gemini", authTypes: ["api_key"] },
  { id: "openrouter", label: "OpenRouter", authTypes: ["api_key"] },
];

async function pickProvider(prompter: Prompter): Promise<string | undefined> {
  console.log("Choose a provider to sign in to:");
  SUGGESTED_PROVIDERS.forEach((p, i) => console.log(`  ${i + 1}) ${p.label}  (${p.id})`));
  console.log("  or type a provider id directly");
  const raw = await prompter.ask(`provider: `);
  if (raw === EOF) return undefined;
  return resolveProviderChoice(
    raw,
    SUGGESTED_PROVIDERS.map((p) => p.id),
  );
}

/** /login — authenticate a provider. */
export async function loginCommand(
  session: AgentSession,
  prompter: Prompter,
  arg: string,
): Promise<void> {
  const providerId = arg.trim() || (await pickProvider(prompter));
  if (!providerId) {
    console.log("cancelled");
    return;
  }

  const runtime = session.modelRuntime;
  const known = SUGGESTED_PROVIDERS.find((p) => p.id === providerId);

  // For Stage 1 we attempt api_key first. If the provider is OAuth-only this
  // will surface as an error until Stage 2 wires the full subscription flow.
  const authType: AuthType = known && !known.authTypes.includes("api_key") ? "oauth" : "api_key";

  if (authType === "oauth") {
    console.log(
      `\nNote: ${providerId} uses OAuth subscription sign-in, which is Stage 2 and not`,
    );
    console.log("yet tested from pi-shell. Attempting anyway; if it fails, set an API key");
    console.log("via environment variable instead (see README).\n");
  }

  const controller = new AbortController();
  const interaction = createTerminalAuthInteraction(prompter, controller.signal);

  try {
    const credential = await runtime.login(providerId, authType, interaction);
    console.log(`\nsigned in to ${providerId} (${credential.type})`);
    await reportAvailability(session, providerId);
  } catch (err) {
    if (err instanceof AuthCancelled) {
      console.log("\ncancelled");
      return;
    }
    console.error(`\nlogin failed: ${err instanceof Error ? err.message : String(err)}`);
    if (authType === "api_key") {
      console.error(
        `tip: you can also set the provider's API key env var before launching pi-shell.`,
      );
    }
  }
}

/** /logout — remove a stored credential. */
export async function logoutCommand(
  session: AgentSession,
  prompter: Prompter,
  arg: string,
): Promise<void> {
  const providerId = arg.trim() || (await pickProvider(prompter));
  if (!providerId) {
    console.log("cancelled");
    return;
  }
  try {
    await session.modelRuntime.logout(providerId);
    console.log(`signed out of ${providerId}`);
  } catch (err) {
    console.error(`logout failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** /auth — show credential and auth status. */
export async function authStatusCommand(session: AgentSession): Promise<void> {
  const runtime = session.modelRuntime;
  const creds = await runtime.listCredentials();

  if (creds.length === 0) {
    console.log("no stored credentials");
  } else {
    console.log("stored credentials:");
    for (const c of creds) {
      const status = runtime.getProviderAuthStatus(c.providerId);
      const src = status.source ? ` [${status.source}]` : "";
      console.log(`  ${c.providerId}  (${c.type})${src}`);
    }
  }

  // Also show ambient-configured providers from the suggested set that have no
  // stored credential but resolve via environment (e.g. Bedrock AWS profile).
  console.log("\nprovider status:");
  for (const p of SUGGESTED_PROVIDERS) {
    const status = runtime.getProviderAuthStatus(p.id);
    const mark = status.configured ? "configured" : "not configured";
    const src = status.source ? ` [${status.source}]` : "";
    console.log(`  ${p.id.padEnd(12)} ${mark}${src}`);
  }
}

/** /model — list available models, or switch if a query is given. */
export async function modelCommand(session: AgentSession, arg: string): Promise<void> {
  const runtime = session.modelRuntime;
  const query = arg.trim().toLowerCase();

  // Only chat models are selectable as the session model.
  let chat: readonly Model<Api>[];
  try {
    chat = await runtime.getAvailableOfType("chat");
  } catch (err) {
    console.error(`could not list models: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const current = session.model;

  if (!query) {
    console.log(`current model: ${modelLabel(current)}`);
    if (chat.length === 0) {
      console.log("no available models — sign in to a provider first with /login");
      return;
    }
    console.log("available models:");
    for (const m of chat) {
      const marker = hasRealModel(current) && sameModel(current, m) ? " *" : "";
      console.log(`  ${m.provider}/${m.id}  (${m.name})${marker}`);
    }
    console.log("\nswitch with: /model <substring>");
    return;
  }

  const matches = matchModels(chat, query);

  if (matches.length === 0) {
    console.log(`no model matches "${query}"`);
    return;
  }
  if (matches.length > 1) {
    console.log(`"${query}" is ambiguous:`);
    for (const m of matches) console.log(`  ${m.provider}/${m.id}`);
    return;
  }

  const chosen = matches[0]!;
  try {
    await session.setModel(chosen);
    console.log(`switched to ${chosen.provider}/${chosen.id}`);
  } catch (err) {
    console.error(`could not switch model: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** After a login, report whether any models are now reachable. */
async function reportAvailability(session: AgentSession, providerId: string): Promise<void> {
  try {
    const models = await session.modelRuntime.getAllAvailable(providerId);
    if (models.length > 0) {
      console.log(`${models.length} model(s) available from ${providerId}`);
      if (!hasRealModel(session.model)) {
        console.log(`tip: pick one with "/model ${providerId}"`);
      }
    }
  } catch {
    // Non-fatal: availability reporting is best-effort.
  }
}
