import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCancelled, select } from "../src/auth-interaction.ts";
import { EOF, type Prompter } from "../src/prompter.ts";

const OPTIONS = [
  { id: "api_key" as const, label: "API key" },
  { id: "oauth" as const, label: "Kiro OAuth", description: "device code" },
];

/** A Prompter that answers each ask() from a fixed script. */
function scripted(...answers: (string | typeof EOF)[]): Prompter {
  const queue = [...answers];
  return { ask: async () => queue.shift() ?? EOF } as unknown as Prompter;
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  log.mockRestore();
});

describe("select", () => {
  it("returns the option chosen by number", async () => {
    expect(await select(scripted("2"), "pick:", OPTIONS)).toBe("oauth");
  });

  it("accepts an option id typed directly", async () => {
    expect(await select(scripted("api_key"), "pick:", OPTIONS)).toBe("api_key");
  });

  it("re-prompts after an invalid entry instead of giving up", async () => {
    expect(await select(scripted("9", "nope", "1"), "pick:", OPTIONS)).toBe("api_key");
    expect(log).toHaveBeenCalledWith("invalid selection, try again");
  });

  it("throws AuthCancelled on EOF", async () => {
    await expect(select(scripted(EOF), "pick:", OPTIONS)).rejects.toBeInstanceOf(AuthCancelled);
  });

  it("lists each option with its description", async () => {
    await select(scripted("1"), "pick:", OPTIONS);
    expect(log).toHaveBeenCalledWith("  1) API key");
    expect(log).toHaveBeenCalledWith("  2) Kiro OAuth — device code");
  });
});
