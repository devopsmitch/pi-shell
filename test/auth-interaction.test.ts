import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCancelled, createTerminalAuthInteraction, select } from "../src/auth-interaction.ts";
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

/** A Prompter that records which method asked what, answering from a script. */
function recording(...answers: (string | typeof EOF)[]) {
  const queue = [...answers];
  const calls: { method: "ask" | "askSecret"; message: string }[] = [];
  const next = () => queue.shift() ?? EOF;
  const prompter = {
    ask: async (message: string) => (calls.push({ method: "ask", message }), next()),
    askSecret: async (message: string) => (calls.push({ method: "askSecret", message }), next()),
  } as unknown as Prompter;
  return { prompter, calls };
}

describe("createTerminalAuthInteraction.prompt", () => {
  it("asks text prompts with the message and returns the answer", async () => {
    const { prompter, calls } = recording("hello");
    const answer = await createTerminalAuthInteraction(prompter).prompt({
      type: "text",
      message: "Name?",
    });
    expect(answer).toBe("hello");
    expect(calls).toEqual([{ method: "ask", message: "Name? " }]);
  });

  it("reads secrets through askSecret so they are not echoed", async () => {
    const { prompter, calls } = recording("sk-123");
    await createTerminalAuthInteraction(prompter).prompt({ type: "secret", message: "Key:" });
    expect(calls).toEqual([{ method: "askSecret", message: "Key: " }]);
  });

  it("reads a pasted manual_code with a visible prompt", async () => {
    const { prompter, calls } = recording("abc");
    await createTerminalAuthInteraction(prompter).prompt({ type: "manual_code", message: "Code:" });
    expect(calls[0]?.method).toBe("ask");
  });

  it("delegates select prompts to the numbered menu", async () => {
    const { prompter } = recording("2");
    const answer = await createTerminalAuthInteraction(prompter).prompt({
      type: "select",
      message: "Pick:",
      options: OPTIONS,
    });
    expect(answer).toBe("oauth");
  });

  it("cancels the login when input ends", async () => {
    const { prompter } = recording(EOF);
    await expect(
      createTerminalAuthInteraction(prompter).prompt({ type: "text", message: "x" }),
    ).rejects.toBeInstanceOf(AuthCancelled);
  });

  it("fails loudly on a prompt type it does not know", async () => {
    const { prompter } = recording("x");
    await expect(
      createTerminalAuthInteraction(prompter).prompt({ type: "bogus", message: "x" } as never),
    ).rejects.toThrow("unsupported auth prompt type: bogus");
  });

  it("exposes the abort signal it was given", () => {
    const signal = new AbortController().signal;
    expect(createTerminalAuthInteraction(recording().prompter, signal).signal).toBe(signal);
  });
});

describe("createTerminalAuthInteraction.notify", () => {
  const notify = (event: Parameters<ReturnType<typeof createTerminalAuthInteraction>["notify"]>[0]) =>
    createTerminalAuthInteraction(recording().prompter).notify(event);
  const printed = () => log.mock.calls.map((c) => String(c[0]));

  it("prints info messages and their links, with optional labels", () => {
    notify({
      type: "info",
      message: "See docs",
      links: [{ url: "https://a.example", label: "Docs" }, { url: "https://b.example" }],
    });
    expect(printed()).toEqual(["See docs", "  Docs: https://a.example", "  https://b.example"]);
  });

  it("prints the sign-in URL and any instructions", () => {
    notify({ type: "auth_url", url: "https://login.example", instructions: "Your code: ABCD" });
    const out = printed().join("\n");
    expect(out).toContain("https://login.example");
    expect(out).toContain("Your code: ABCD");
  });

  it("omits instructions when there are none", () => {
    notify({ type: "auth_url", url: "https://login.example" });
    expect(printed().join("\n")).not.toContain("undefined");
  });

  it("prints the device code, with expiry only when given", () => {
    notify({ type: "device_code", userCode: "WXYZ", verificationUri: "https://v.example", expiresInSeconds: 600 });
    expect(printed().join("\n")).toContain("(expires in 600s)");
    log.mockClear();
    notify({ type: "device_code", userCode: "WXYZ", verificationUri: "https://v.example" });
    const out = printed().join("\n");
    expect(out).toContain("Enter code: WXYZ");
    expect(out).not.toContain("expires");
  });

  it("prints progress messages", () => {
    notify({ type: "progress", message: "Waiting…" });
    expect(printed()).toEqual(["Waiting…"]);
  });

  it("names event types it does not know instead of dropping them", () => {
    notify({ type: "mystery" } as never);
    expect(printed()).toEqual(["[auth] mystery"]);
  });
});
