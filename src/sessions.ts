/** /sessions (list) and /delete (remove) saved sessions for this directory. */
import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import { unlink } from "node:fs/promises";
import { EOF, type Prompter } from "./prompter.ts";

/** Describe a session in one line for the picker, newest activity first. */
export function formatSessionLine(info: SessionInfo, index: number, active: boolean): string {
  const marker = active ? " *" : "";
  const name = info.name ? `"${info.name}" ` : "";
  const when = info.modified.toISOString().replace("T", " ").slice(0, 16);
  const preview = sessionPreview(info);
  return `  ${index + 1}) ${name}${when}  ${info.messageCount} msg${marker}\n       ${preview}`;
}

/** First user message (or id) as a short preview, collapsed to a single line. */
export function sessionPreview(info: SessionInfo): string {
  const raw = (info.firstMessage || info.id).replace(/\s+/g, " ").trim();
  const max = 72;
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

/** Order sessions newest-activity first, matching Pi's default picker sort. */
export function sortByRecent(sessions: readonly SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

/**
 * Parse a selection string ("2", "1 3 4", "2-5", "all") against a list length.
 * Returns zero-based indices (deduped, sorted), or null if nothing valid parsed.
 */
export function parseSelection(raw: string, count: number): number[] | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === "all" || trimmed === "*") {
    return Array.from({ length: count }, (_, i) => i);
  }

  const picked = new Set<number>();
  for (const token of trimmed.split(/[\s,]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const lo = Number.parseInt(range[1]!, 10);
      const hi = Number.parseInt(range[2]!, 10);
      if (lo < 1 || hi < 1 || lo > count || hi > count) return null;
      const [from, to] = lo <= hi ? [lo, hi] : [hi, lo];
      for (let n = from; n <= to; n++) picked.add(n - 1);
      continue;
    }
    const n = Number.parseInt(token, 10);
    if (!Number.isInteger(n) || String(n) !== token || n < 1 || n > count) return null;
    picked.add(n - 1);
  }

  return picked.size === 0 ? null : [...picked].sort((a, b) => a - b);
}

/**
 * Parse a single-index selection ("2") against a list length. Returns the
 * zero-based index, or null if it is not a single valid in-range number.
 * Unlike parseSelection, this rejects ranges, lists, and "all".
 */
export function parseSingleIndex(raw: string, count: number): number | null {
  const trimmed = raw.trim();
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || String(n) !== trimmed || n < 1 || n > count) return null;
  return n - 1;
}

/** Predicate: is this the session currently open in the shell? */
export type IsActive = (info: SessionInfo) => boolean;

/** Load saved sessions for the current directory, newest activity first. */
async function loadSessions(sessionDir: string | undefined): Promise<SessionInfo[]> {
  // An empty dir (e.g. an in-memory session) means "use the default location
  // for this cwd"; passing undefined to list() does exactly that.
  const dir = sessionDir || undefined;
  return sortByRecent(await SessionManager.list(process.cwd(), dir));
}

/** Build the "is this session active?" predicate from the open session file. */
function makeIsActive(activeSessionFile: string | undefined): IsActive {
  return (info) => activeSessionFile !== undefined && info.path === activeSessionFile;
}

/** Print the numbered session list; the active one is marked. */
function printSessions(sessions: readonly SessionInfo[], isActive: IsActive): void {
  console.log(`saved sessions (${sessions.length}):`);
  sessions.forEach((info, i) => console.log(formatSessionLine(info, i, isActive(info))));
}

/**
 * /sessions — list saved sessions for the current directory (read-only).
 * The currently-active session is marked with `*`. Use /delete to remove.
 */
export async function sessionsCommand(
  activeSessionFile: string | undefined,
  sessionDir: string | undefined,
): Promise<void> {
  let sessions: SessionInfo[];
  try {
    sessions = await loadSessions(sessionDir);
  } catch (err) {
    console.error(`could not list sessions: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (sessions.length === 0) {
    console.log("no saved sessions for this directory");
    return;
  }

  printSessions(sessions, makeIsActive(activeSessionFile));
  console.log("\nresume one with: /resume   ·   delete some with: /delete");
}

/**
 * /resume — switch to a previously saved session. With an index argument
 * ("/resume 2") it opens that session directly; with no argument it lists the
 * sessions and prompts for one. Returns the path of the session to open, or
 * undefined if there is nothing to do (no sessions, cancelled, bad input, or
 * the chosen session is already active).
 */
export async function resumeCommand(
  prompter: Prompter,
  arg: string,
  activeSessionFile: string | undefined,
  sessionDir: string | undefined,
): Promise<string | undefined> {
  let sessions: SessionInfo[];
  try {
    sessions = await loadSessions(sessionDir);
  } catch (err) {
    console.error(`could not list sessions: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }

  if (sessions.length === 0) {
    console.log("no saved sessions for this directory");
    return undefined;
  }

  const isActive = makeIsActive(activeSessionFile);

  // With an index argument, resolve it directly. Otherwise list and prompt.
  let index: number | null;
  const selection = arg.trim();
  if (selection) {
    index = parseSingleIndex(selection, sessions.length);
    if (index === null) {
      console.log(`"${selection}" is not a valid session number (1-${sessions.length})`);
      return undefined;
    }
  } else {
    printSessions(sessions, isActive);
    const raw = await prompter.ask(
      `\nresume which? (1-${sessions.length}; blank to cancel): `,
    );
    if (raw === EOF) {
      console.log("cancelled");
      return undefined;
    }
    index = parseSingleIndex(raw, sessions.length);
    if (index === null) {
      console.log(raw.trim() ? "not a valid session number; cancelled" : "cancelled");
      return undefined;
    }
  }

  const chosen = sessions[index]!;
  if (isActive(chosen)) {
    console.log("that session is already active");
    return undefined;
  }
  return chosen.path;
}

/**
 * /delete — remove saved sessions. With a selection argument ("2", "1 3",
 * "2-5", "all") it deletes directly; with no argument it lists the sessions
 * and prompts for which to remove. The currently-active session is skipped.
 */
export async function deleteCommand(
  prompter: Prompter,
  arg: string,
  activeSessionFile: string | undefined,
  sessionDir: string | undefined,
): Promise<void> {
  let sessions: SessionInfo[];
  try {
    sessions = await loadSessions(sessionDir);
  } catch (err) {
    console.error(`could not list sessions: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  if (sessions.length === 0) {
    console.log("no saved sessions for this directory");
    return;
  }

  const isActive = makeIsActive(activeSessionFile);

  // With a selection argument, delete straight away. Otherwise show the list
  // and prompt interactively.
  const selection = arg.trim();
  if (selection) {
    const indices = parseSelection(selection, sessions.length);
    if (indices === null) {
      console.log(`"${selection}" did not match any sessions (there are ${sessions.length})`);
      return;
    }
    await deleteSessions(sessions, indices, isActive);
    return;
  }

  printSessions(sessions, isActive);
  await promptDelete(prompter, sessions, isActive);
}

/** Prompt for a selection and delete the chosen session files. */
async function promptDelete(
  prompter: Prompter,
  sessions: readonly SessionInfo[],
  isActive: IsActive,
): Promise<void> {
  const raw = await prompter.ask(
    "\ndelete which? (e.g. 2, 1 3, 2-5, all; blank to cancel): ",
  );
  if (raw === EOF) {
    console.log("cancelled");
    return;
  }

  const indices = parseSelection(raw, sessions.length);
  if (indices === null) {
    console.log(raw.trim() ? "nothing matched; cancelled" : "cancelled");
    return;
  }

  await deleteSessions(sessions, indices, isActive);
}

/** One session chosen for deletion, resolved to its path and display index. */
export interface DeletionTarget {
  /** Zero-based index into the listed sessions. */
  index: number;
  path: string;
}

/** Split selected indices into those to delete and those skipped as active. */
export interface DeletionPlan {
  toDelete: DeletionTarget[];
  skippedActive: DeletionTarget[];
}

/**
 * Decide which selected sessions to delete, keeping the active one safe.
 * Pure: takes the session list, the chosen indices, and the active predicate,
 * and returns the split without touching the filesystem.
 */
export function planDeletion(
  sessions: readonly SessionInfo[],
  indices: readonly number[],
  isActive: IsActive,
): DeletionPlan {
  const toDelete: DeletionTarget[] = [];
  const skippedActive: DeletionTarget[] = [];
  for (const index of indices) {
    const info = sessions[index];
    if (!info) continue;
    const target = { index, path: info.path };
    (isActive(info) ? skippedActive : toDelete).push(target);
  }
  return { toDelete, skippedActive };
}

/** Delete the sessions at the given indices, skipping the active one. */
async function deleteSessions(
  sessions: readonly SessionInfo[],
  indices: readonly number[],
  isActive: IsActive,
): Promise<void> {
  const { toDelete, skippedActive } = planDeletion(sessions, indices, isActive);

  for (const { index } of skippedActive) {
    console.log(`  skipped ${index + 1}: that session is currently active`);
  }

  let deleted = 0;
  for (const { index, path } of toDelete) {
    try {
      await unlink(path);
      deleted++;
    } catch (err) {
      console.error(
        `  could not delete ${index + 1}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log(deleted === 1 ? "deleted 1 session" : `deleted ${deleted} sessions`);
}
