# pi-shell

A minimal shell-prompt interface for the [Pi](https://pi.dev) agent harness.

No TUI — just a `> ` prompt, clean streaming text output, and a persistent
session so conversation context and history carry across turns and across runs.

## Requirements

- Node.js 22.19+ (developed on v24)
- A configured Pi provider/credentials. If you haven't set one up, run `pi`
  once and use `/login`, or configure an API key. pi-shell reuses Pi's standard
  settings, credentials, and resource discovery.

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

- `/new` — start a fresh persistent session
- `/exit` or `/quit` — leave
- Anything else is sent to Pi, including Pi's own slash-commands such as
  `/model`, and prompt-template expansion.

`Ctrl+C` interrupts an in-progress response; pressing it when idle exits.

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
npm run dev          # tsx watch
```
