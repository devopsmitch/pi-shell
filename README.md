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
  The auth method (API key vs OAuth) is taken from the provider itself. Stage 1
  supports API-key sign-in; OAuth subscription sign-in (Claude Pro, ChatGPT) is
  Stage 2 and not yet wired.
- `/logout [provider]` — remove a stored credential.
- `/auth` — show configured providers (stored credentials and ambient auth).
- `/model [query]` — list available models, or switch to the one matching
  `query` (substring of provider/id/name).
- `/new` — start a fresh persistent session.
- `/help` — show commands.
- `/exit` or `/quit` — leave. `Ctrl+D` (EOF) also exits.

`Ctrl+C` interrupts an in-progress response; pressing it when idle exits.

Any other input is sent to the agent, including Pi's own slash-commands and
prompt-template expansion.

## Authentication

pi-shell reuses Pi's standard credential storage (`~/.pi/agent/auth.json`) and
ambient credentials, so you can authenticate any of these ways:

- `/login <provider>` inside pi-shell (API-key providers; run `/login` with no
  argument to see every supported provider id).
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

