/** Tab completion for the prompt. Phase 1: filesystem path completion. */
import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/** Line up to the cursor, plus room to grow (cursor position, etc.). */
export interface CompletionContext {
  line: string;
}

/** readline's completer result: [matches, the fragment they replace]. */
export type CompletionResult = [string[], string];

export type Completer = (
  ctx: CompletionContext,
) => CompletionResult | Promise<CompletionResult>;

/** List a directory's entries, marking which are directories. Injected for tests. */
export type ListDir = (dir: string) => { name: string; isDir: boolean }[];

/** Default lister rooted at `cwd`; returns [] for unreadable/missing dirs. */
export function makeFsListDir(cwd: string): ListDir {
  return (dir) => {
    try {
      return readdirSync(join(cwd, dir) || ".", { withFileTypes: true }).map((e) => ({
        name: e.name,
        // Resolve symlinks so linked directories still get a trailing slash.
        isDir: e.isDirectory() || (e.isSymbolicLink() && isDirLink(join(cwd, dir, e.name))),
      }));
    } catch {
      return [];
    }
  };
}

function isDirLink(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Complete a path fragment against a directory listing. Directory matches get a
 * trailing slash so tabbing can descend. Dotfiles appear only when the prefix
 * starts with ".". Returns matches plus the fragment they replace.
 */
export function completePath(fragment: string, listDir: ListDir): CompletionResult {
  // "src/" lists that dir with empty prefix; "src/pi" lists "src/" matching "pi".
  const dir = fragment.endsWith("/") ? fragment.slice(0, -1) : dirname(fragment);
  const prefix = fragment.endsWith("/") ? "" : basename(fragment);
  const dirPart = fragment.includes("/") ? `${dir}/` : "";

  const entries = listDir(dir === "." && !fragment.startsWith("./") ? "" : dir);
  const matches = entries
    .filter((e) => e.name.startsWith(prefix))
    .filter((e) => prefix.startsWith(".") || !e.name.startsWith("."))
    .map((e) => `${dirPart}${e.name}${e.isDir ? "/" : ""}`)
    .sort();

  // A single file match gets a trailing space (shell-style) so the next token
  // starts cleanly; a lone directory keeps its "/" so tabbing can descend.
  if (matches.length === 1 && !matches[0]!.endsWith("/")) {
    return [[`${matches[0]} `], fragment];
  }

  return [matches, fragment];
}

/**
 * REPL prompt completer: completes the last whitespace-delimited token as a
 * path. Structured so command-aware completion (e.g. /model) can branch in here
 * later without touching the prompter.
 */
export function makeReplCompleter(listDir: ListDir): Completer {
  return ({ line }) => {
    const fragment = line.slice(line.lastIndexOf(" ") + 1);
    const [matches] = completePath(fragment, listDir);
    return [matches, fragment];
  };
}
