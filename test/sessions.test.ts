import { describe, expect, it } from "vitest";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import {
  formatSessionLine,
  parseSelection,
  parseSingleIndex,
  planDeletion,
  sessionPreview,
  sortByRecent,
} from "../src/sessions.ts";

function info(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    path: "/sessions/a.jsonl",
    id: "abc123",
    cwd: "/work",
    created: new Date("2024-01-01T10:00:00Z"),
    modified: new Date("2024-01-02T12:30:00Z"),
    messageCount: 5,
    firstMessage: "hello there",
    allMessagesText: "hello there",
    ...overrides,
  };
}

describe("sessionPreview", () => {
  it("uses the first message, collapsed to one line", () => {
    expect(sessionPreview(info({ firstMessage: "line one\n  line two" }))).toBe(
      "line one line two",
    );
  });

  it("falls back to the id when there is no first message", () => {
    expect(sessionPreview(info({ firstMessage: "", id: "xyz" }))).toBe("xyz");
  });

  it("truncates long messages with an ellipsis", () => {
    const long = "x".repeat(100);
    const preview = sessionPreview(info({ firstMessage: long }));
    expect(preview.length).toBe(72);
    expect(preview.endsWith("…")).toBe(true);
  });
});

describe("formatSessionLine", () => {
  it("includes index, date, count and preview", () => {
    const line = formatSessionLine(info(), 0, false);
    expect(line).toContain("1)");
    expect(line).toContain("2024-01-02 12:30");
    expect(line).toContain("5 msg");
    expect(line).toContain("hello there");
  });

  it("marks the active session and shows a name when present", () => {
    const line = formatSessionLine(info({ name: "my work" }), 2, true);
    expect(line).toContain("3)");
    expect(line).toContain('"my work"');
    expect(line.trimEnd()).toMatch(/\*/);
  });
});

describe("sortByRecent", () => {
  it("orders by most recently modified first without mutating input", () => {
    const older = info({ path: "a", modified: new Date("2024-01-01T00:00:00Z") });
    const newer = info({ path: "b", modified: new Date("2024-03-01T00:00:00Z") });
    const input = [older, newer];
    const sorted = sortByRecent(input);
    expect(sorted.map((s) => s.path)).toEqual(["b", "a"]);
    expect(input.map((s) => s.path)).toEqual(["a", "b"]);
  });
});

describe("parseSelection", () => {
  it("parses a single index", () => {
    expect(parseSelection("2", 5)).toEqual([1]);
  });

  it("parses space- and comma-separated indices, deduped and sorted", () => {
    expect(parseSelection("3, 1 3", 5)).toEqual([0, 2]);
  });

  it("parses ranges in either direction", () => {
    expect(parseSelection("2-4", 5)).toEqual([1, 2, 3]);
    expect(parseSelection("4-2", 5)).toEqual([1, 2, 3]);
  });

  it("treats 'all' and '*' as every index", () => {
    expect(parseSelection("all", 3)).toEqual([0, 1, 2]);
    expect(parseSelection("*", 2)).toEqual([0, 1]);
  });

  it("returns null for blank or unparseable input", () => {
    expect(parseSelection("", 5)).toBeNull();
    expect(parseSelection("   ", 5)).toBeNull();
    expect(parseSelection("x", 5)).toBeNull();
    expect(parseSelection("1.5", 5)).toBeNull();
  });

  it("returns null when any index is out of range", () => {
    expect(parseSelection("6", 5)).toBeNull();
    expect(parseSelection("0", 5)).toBeNull();
    expect(parseSelection("1-9", 5)).toBeNull();
  });
});

describe("parseSingleIndex", () => {
  it("parses a single in-range number to a zero-based index", () => {
    expect(parseSingleIndex("1", 5)).toBe(0);
    expect(parseSingleIndex(" 3 ", 5)).toBe(2);
  });

  it("rejects out-of-range, zero, and negatives", () => {
    expect(parseSingleIndex("0", 5)).toBeNull();
    expect(parseSingleIndex("6", 5)).toBeNull();
    expect(parseSingleIndex("-1", 5)).toBeNull();
  });

  it("rejects ranges, lists, 'all', and non-numbers", () => {
    expect(parseSingleIndex("", 5)).toBeNull();
    expect(parseSingleIndex("2-4", 5)).toBeNull();
    expect(parseSingleIndex("1 2", 5)).toBeNull();
    expect(parseSingleIndex("all", 5)).toBeNull();
    expect(parseSingleIndex("1.5", 5)).toBeNull();
    expect(parseSingleIndex("x", 5)).toBeNull();
  });
});

describe("planDeletion", () => {
  const sessions = [
    info({ path: "/s/a.jsonl" }),
    info({ path: "/s/b.jsonl" }),
    info({ path: "/s/c.jsonl" }),
  ];
  const never = () => false;

  it("plans every selected index for deletion when none are active", () => {
    const plan = planDeletion(sessions, [0, 2], never);
    expect(plan.toDelete).toEqual([
      { index: 0, path: "/s/a.jsonl" },
      { index: 2, path: "/s/c.jsonl" },
    ]);
    expect(plan.skippedActive).toEqual([]);
  });

  it("skips the active session instead of deleting it", () => {
    const isActive = (s: SessionInfo) => s.path === "/s/b.jsonl";
    const plan = planDeletion(sessions, [0, 1, 2], isActive);
    expect(plan.toDelete.map((t) => t.path)).toEqual(["/s/a.jsonl", "/s/c.jsonl"]);
    expect(plan.skippedActive).toEqual([{ index: 1, path: "/s/b.jsonl" }]);
  });

  it("skips only the active session when it is the sole selection", () => {
    const isActive = (s: SessionInfo) => s.path === "/s/a.jsonl";
    const plan = planDeletion(sessions, [0], isActive);
    expect(plan.toDelete).toEqual([]);
    expect(plan.skippedActive).toEqual([{ index: 0, path: "/s/a.jsonl" }]);
  });

  it("ignores indices that fall outside the session list", () => {
    const plan = planDeletion(sessions, [0, 9], never);
    expect(plan.toDelete).toEqual([{ index: 0, path: "/s/a.jsonl" }]);
    expect(plan.skippedActive).toEqual([]);
  });
});
