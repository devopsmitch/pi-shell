# pi-shell

[![CI](https://github.com/devopsmitch/pi-shell/actions/workflows/ci.yml/badge.svg)](https://github.com/devopsmitch/pi-shell/actions/workflows/ci.yml)

Minimal shell-prompt interface for the [Pi](https://pi.dev) agent harness — no
TUI, just clean text and persistent sessions.

Conversation context and history carry across turns, and across runs unless
started with `--new` or `--in-memory`.

## Requirements

- Node.js 24+
- A configured Pi provider/credential. Sign in from pi-shell with
  `/login <provider>` (API-key providers), set an API-key env var before
  launch, or use ambient cloud credentials (e.g. an AWS profile for Bedrock).
  pi-shell reuses Pi's standard settings, credentials, and resource discovery.

## Install

```bash
npm install
```

## Run

```bash
npm start            # resume the most recent session for this directory
npm start -- --new   # force a fresh persistent session
npm start -- --in-memory   # ephemeral session, nothing written to disk
```

## Commands

Typed at the `> ` prompt:

- `/login [provider]` — sign in to a provider. With no argument, lists every
  provider Pi supports (derived from the SDK, so new providers appear
  automatically); or pass a provider id directly, e.g. `/login amazon-bedrock`.
  If a provider supports more than one auth method (API key and OAuth), you
  are asked which to use; otherwise it goes straight through. API-key sign-in
  is the tested path; OAuth sign-in works for some providers (e.g. Kiro's
  Builder ID device-code flow) but browser auto-launch and the subscription
  providers (Claude Pro, ChatGPT) are Stage 2 and not yet verified.
- `/logout [provider]` — remove a stored credential.
- `/auth` — show configured providers (stored credentials and ambient auth).
- `/model [query]` — list available models, or switch to the one matching
  `query` (substring of provider/id/name).
- `/usage` — token counts, estimated cost, and context window use for the
  current session. Cost is estimated from the model catalog's per-token
  prices, covers this session only, and will not match your provider bill.
  Models without per-token pricing (e.g. Kiro, which bills in credits) show
  cost as n/a.
- `/new` — start a fresh persistent session.
- `/help` — show commands.
- `/exit` or `/quit` — leave. `Ctrl+D` (EOF) also exits.

`Ctrl+C` interrupts an in-progress response; pressing it when idle exits.

Any other input is sent to the agent, including Pi's own slash-commands and
prompt-template expansion.

## Authentication

pi-shell reuses Pi's standard credential storage (`~/.pi/agent/auth.json`) and
ambient credentials, so you can authenticate any of these ways:

- `/login <provider>` inside pi-shell (run `/login` with no argument to see
  every supported provider id).
- An environment variable before launch, e.g. `export OPENROUTER_API_KEY=...`
  or `export GEMINI_API_KEY=...`.
- Ambient cloud credentials (e.g. an AWS profile for Bedrock).
- The regular `pi` TUI's `/login` (for OAuth subscriptions, until Stage 2).

## How it works

Built on the Pi TypeScript SDK (`@earendil-works/pi-coding-agent`):

- `createAgentSession()` wires up the model, tools, context files, and
  credentials using Pi's normal discovery.
- `SessionManager.continueRecent()` / `.create()` / `.inMemory()` control
  persistence. Persistent sessions are stored as JSONL under
  `~/.pi/agent/sessions/`.
- `session.subscribe()` streams assistant `text_delta` events straight to
  stdout for plain-text output.

### Extensions

pi-shell loads Pi extension packages the same way Pi itself does, including
model providers. For an extra you only need in some projects, install it
personally once with Pi's package manager:

```bash
pi install npm:pi-provider-kiro
```

That installs it under `~/.pi/agent` and records it in Pi's settings, so every
pi-shell session (and the regular `pi` TUI) picks it up, with no dependency on
the current project's `node_modules` and no `pi-provider-kiro` listed in
pi-shell's own `package.json`.

pi-shell also scans `node_modules` in the current working directory at
startup, for packages whose `package.json` declares
`"pi": { "extensions": [...] }`, and loads those entry points too. Use this if
you'd rather add the extension as a per-project `npm install` dependency
instead of a personal `pi install`.

Extensions run with your full permissions, so only install packages you trust.
The auto-discovery only reads packages that are already installed; it never
installs anything itself.

## Development

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest run (unit tests for pure helpers)
npm run test:watch   # vitest in watch mode
npm run dev          # tsx watch
```

## License

MIT — see [LICENSE](LICENSE). Dependencies are licensed separately under their
own terms.

