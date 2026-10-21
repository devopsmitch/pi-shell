/** Pure helpers for rendering agent activity indicators. I/O-free so testable. */

/**
 * A one-line label for a running tool, e.g. `bash: npm test` or `read src/x.ts`,
 * falling back to the bare tool name. The arg field per tool comes from the
 * SDK's built-in tool schemas (bash→command, read/write/edit/ls→path,
 * grep/find→pattern).
 */
export function toolActivityLabel(toolName: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim() : undefined;

  // Prefer the most informative field per tool: the command for bash, the
  // search pattern for grep/find, otherwise the path.
  const detail =
    toolName === "bash"
      ? str(a.command)
      : toolName === "grep" || toolName === "find"
        ? str(a.pattern) ?? str(a.path)
        : str(a.path) ?? str(a.pattern) ?? str(a.query);
  if (!detail) return `${toolName}…`;

  // Keep it to one tidy line.
  const oneLine = detail.replace(/\s+/g, " ");
  const clipped = oneLine.length > 72 ? `${oneLine.slice(0, 71)}…` : oneLine;
  return `${toolName}: ${clipped}`;
}
