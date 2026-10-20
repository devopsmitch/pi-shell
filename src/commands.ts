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
import { type Api, type Model } from "@earendil-works/pi-ai";
import { AuthCancelled, createTerminalAuthInteraction } from "./auth-interaction.ts";
import {
  hasRealModel,
  matchModels,
  modelLabel,
  sameModel,
} from "./model-select.ts";
import {
  formatProviderColumns,
  preferredAuthType,
  providerInfos,
  type ProviderInfo,
} from "./providers.ts";
import { EOF, type Prompter } from "./prompter.ts";

/** Load and distil the providers Pi knows about, sorted by id. */
function listProviders(session: AgentSession): ProviderInfo[] {
  return providerInfos(session.modelRuntime.getProviders());
}

async function pickProvider(
  session: AgentSession,
  prompter: Prompter,
): Promise<string | undefined> {
  const providers = listProviders(session);
  const ids = providers.map((p) => p.id);
  console.log("Providers Pi supports:");
  for (const line of formatProviderColumns(ids)) console.log(`  ${line}`);
  const raw = await prompter.ask(`\nprovider id: `);
  if (raw === EOF) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

/** /login — authenticate a provider. */
export async function loginCommand(
  session: AgentSession,
  prompter: Prompter,
  arg: string,
): Promise<void> {
  const providerId = arg.trim() || (await pickProvider(session, prompter));
  if (!providerId) {
    console.log("cancelled");
    return;
  }

  const runtime = session.modelRuntime;
  const provider = runtime.getProvider(providerId);
  if (!provider) {
    console.error(`unknown provider "${providerId}". Run /login with no argument to list them.`);
    return;
  }

  const info = providerInfos([provider])[0]!;
  if (info.authTypes.length === 0) {
    console.error(`provider "${providerId}" declares no supported auth methods.`);
    return;
  }
  const authType = preferredAuthType(info);

  if (authType === "oauth") {
    console.log(
      `\nNote: ${info.name} uses OAuth sign-in, which is Stage 2 and not yet tested`,
    );
    console.log("from pi-shell. Attempting anyway; if it fails, set an API key via");
    console.log("environment variable instead (see README).\n");
  }

  const controller = new AbortController();
  const interaction = createTerminalAuthInteraction(prompter, controller.signal);

  try {
    const credential = await runtime.login(providerId, authType, interaction);
    console.log(`\nsigned in to ${providerId} (${credential.type})`);
    await reportAvailability(session, providerId);
  } catch (err) {
    if (err instanceof AuthCancelled) {
      console.log("cancelled");
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
  const providerId = arg.trim() || (await pickProvider(session, prompter));
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

/** /auth — show configured providers (stored credentials and ambient auth). */
export async function authStatusCommand(session: AgentSession): Promise<void> {
  const runtime = session.modelRuntime;
  const providers = listProviders(session);

  const configured = providers
    .map((p) => ({ ...p, status: runtime.getProviderAuthStatus(p.id) }))
    .filter((p) => p.status.configured);

  if (configured.length === 0) {
    console.log("no configured providers — sign in with /login <provider>");
    return;
  }

  console.log("configured providers:");
  const width = Math.max(...configured.map((p) => p.id.length));
  for (const p of configured) {
    const src = p.status.source ? ` [${p.status.source}]` : "";
    console.log(`  ${p.id.padEnd(width)}  ${p.name}${src}`);
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
