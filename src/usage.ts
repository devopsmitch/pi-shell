/**
 * Pure formatting for /usage. Takes the SDK's session stats shape (only the
 * fields used here) so it is unit testable without a session.
 */

export interface UsageStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  /** Estimated cost in USD, from the model catalog's per-token prices. */
  cost: number;
  contextUsage?: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
}

/** 1234567 -> "1,234,567". */
function n(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Dollar amount with enough precision for small sessions. */
export function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/**
 * Lines for the /usage report. `modelPriced` says whether the active model has
 * per-token prices; credit-billed providers (e.g. Kiro) do not, so a $0 cost
 * there means "not tracked", not "free".
 */
export function formatUsage(stats: UsageStats, modelPriced: boolean): string[] {
  const { tokens, contextUsage } = stats;
  const lines = [
    `messages:  ${n(stats.userMessages)} user, ${n(stats.assistantMessages)} assistant, ${n(stats.toolCalls)} tool calls`,
    `tokens:    ${n(tokens.total)} total`,
    `  input        ${n(tokens.input)}`,
    `  output       ${n(tokens.output)}`,
    `  cache read   ${n(tokens.cacheRead)}`,
    `  cache write  ${n(tokens.cacheWrite)}`,
  ];

  if (modelPriced) {
    lines.push(`cost:      ${formatCost(stats.cost)} (estimate)`);
  } else {
    lines.push("cost:      n/a (active model has no per-token pricing)");
  }

  if (contextUsage) {
    const used =
      contextUsage.tokens === null || contextUsage.percent === null
        ? "unknown"
        : `${n(contextUsage.tokens)} (${contextUsage.percent.toFixed(1)}%)`;
    lines.push(`context:   ${used} of ${n(contextUsage.contextWindow)}`);
  }

  lines.push("this session only; estimate from catalog prices, not your bill.");
  return lines;
}
