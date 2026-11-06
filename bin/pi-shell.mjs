#!/usr/bin/env node
/**
 * Global launcher for pi-shell. Installed as the `pi-shell` bin (via npm link
 * or npm i -g) so the command works from any project directory.
 *
 * The entry point is TypeScript, so we run it through pi-shell's *own* tsx —
 * resolved by absolute path from this script — rather than `npx tsx`, which
 * would resolve tsx relative to the caller's cwd and could fail or download it.
 * The child inherits the caller's working directory, which is what pi-shell
 * uses to pick the session and project context.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const tsx = join(root, "node_modules", ".bin", "tsx");
const entry = join(root, "src", "pi-shell.ts");

const child = spawn(tsx, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    // Re-raise the signal so the parent shell sees the real termination cause.
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on("error", (err) => {
  console.error(`pi-shell: failed to launch (${err.message})`);
  process.exit(1);
});
