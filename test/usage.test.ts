import { describe, expect, it } from "vitest";
import { formatCost, formatUsage, type UsageStats } from "../src/usage.ts";

const STATS: UsageStats = {
  userMessages: 3,
  assistantMessages: 3,
  toolCalls: 7,
  tokens: { input: 12000, output: 3400, cacheRead: 250000, cacheWrite: 8000, total: 273400 },
  cost: 0.4321,
  contextUsage: { tokens: 50000, contextWindow: 200000, percent: 25 },
};

describe("formatCost", () => {
  it("shows zero plainly", () => {
    expect(formatCost(0)).toBe("$0.00");
  });

  it("keeps extra precision for sub-cent amounts", () => {
    expect(formatCost(0.0042)).toBe("$0.0042");
  });

  it("uses two decimals otherwise", () => {
    expect(formatCost(0.4321)).toBe("$0.43");
    expect(formatCost(12.5)).toBe("$12.50");
  });
});

describe("formatUsage", () => {
  it("reports messages, token breakdown, cost and context", () => {
    const text = formatUsage(STATS, true).join("\n");
    expect(text).toContain("3 user, 3 assistant, 7 tool calls");
    expect(text).toContain("273,400 total");
    expect(text).toContain("cache read   250,000");
    expect(text).toContain("$0.43 (estimate)");
    expect(text).toContain("50,000 (25.0%) of 200,000");
  });

  it("says cost is n/a when the model has no pricing", () => {
    const text = formatUsage({ ...STATS, cost: 0 }, false).join("\n");
    expect(text).toContain("n/a");
    expect(text).not.toContain("$0.00");
  });

  it("handles unknown context usage (e.g. just after compaction)", () => {
    const text = formatUsage(
      { ...STATS, contextUsage: { tokens: null, contextWindow: 200000, percent: null } },
      true,
    ).join("\n");
    expect(text).toContain("unknown of 200,000");
  });

  it("omits the context line when the SDK reports none", () => {
    const text = formatUsage({ ...STATS, contextUsage: undefined }, true).join("\n");
    expect(text).not.toContain("context:");
  });
});
