import { describe, expect, it } from "vitest";
import { toolActivityLabel } from "../src/activity.ts";

describe("toolActivityLabel", () => {
  it("shows the command for bash", () => {
    expect(toolActivityLabel("bash", { command: "npm test" })).toBe("bash: npm test");
  });

  it("shows the path for file tools", () => {
    expect(toolActivityLabel("read", { path: "src/x.ts" })).toBe("read: src/x.ts");
    expect(toolActivityLabel("write", { path: "a.txt", content: "…" })).toBe("write: a.txt");
  });

  it("shows the pattern for search tools", () => {
    expect(toolActivityLabel("grep", { pattern: "TODO", path: "src" })).toBe("grep: TODO");
  });

  it("falls back to the bare name when no known detail is present", () => {
    expect(toolActivityLabel("mcp__something", { foo: 1 })).toBe("mcp__something…");
    expect(toolActivityLabel("read", {})).toBe("read…");
    expect(toolActivityLabel("bash", undefined)).toBe("bash…");
  });

  it("collapses whitespace to a single line", () => {
    expect(toolActivityLabel("bash", { command: "ls -la\n  && pwd" })).toBe(
      "bash: ls -la && pwd",
    );
  });

  it("truncates long details", () => {
    const long = "x".repeat(100);
    const label = toolActivityLabel("bash", { command: long });
    expect(label.length).toBeLessThanOrEqual("bash: ".length + 72);
    expect(label.endsWith("…")).toBe(true);
  });
});
