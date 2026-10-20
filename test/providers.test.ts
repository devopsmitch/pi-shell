import { describe, expect, it } from "vitest";
import type { Provider } from "@earendil-works/pi-ai";
import {
  formatProviderColumns,
  preferredAuthType,
  providerInfos,
  toProviderInfo,
} from "../src/providers.ts";

/** Build a minimal Provider stub with the auth methods we care about. */
function provider(
  id: string,
  name: string,
  auth: { apiKey?: boolean; oauth?: boolean; subscription?: boolean },
): Provider {
  return {
    id,
    name,
    auth: {
      apiKey: auth.apiKey ? ({ name: `${name} API key` } as never) : undefined,
      oauth: auth.oauth
        ? ({ name: `${name} OAuth`, isSubscription: auth.subscription } as never)
        : undefined,
    },
  } as unknown as Provider;
}

describe("toProviderInfo", () => {
  it("reports api_key only", () => {
    expect(toProviderInfo(provider("groq", "Groq", { apiKey: true })).authTypes).toEqual([
      "api_key",
    ]);
  });

  it("reports oauth only", () => {
    expect(
      toProviderInfo(provider("openai-codex", "Codex", { oauth: true })).authTypes,
    ).toEqual(["oauth"]);
  });

  it("prefers oauth first for subscription providers", () => {
    const info = toProviderInfo(
      provider("anthropic", "Anthropic", { apiKey: true, oauth: true, subscription: true }),
    );
    expect(info.authTypes).toEqual(["oauth", "api_key"]);
  });

  it("prefers api_key first when oauth is not a subscription", () => {
    const info = toProviderInfo(
      provider("openrouter", "OpenRouter", { apiKey: true, oauth: true }),
    );
    expect(info.authTypes).toEqual(["api_key", "oauth"]);
  });
});

describe("providerInfos", () => {
  it("distils and sorts by id", () => {
    const list = providerInfos([
      provider("openai", "OpenAI", { apiKey: true }),
      provider("anthropic", "Anthropic", { apiKey: true }),
    ]);
    expect(list.map((p) => p.id)).toEqual(["anthropic", "openai"]);
  });
});

describe("preferredAuthType", () => {
  it("returns the first supported method", () => {
    expect(preferredAuthType({ id: "x", name: "X", authTypes: ["oauth", "api_key"] })).toBe(
      "oauth",
    );
  });

  it("defaults to api_key when none are listed", () => {
    expect(preferredAuthType({ id: "x", name: "X", authTypes: [] })).toBe("api_key");
  });
});

describe("formatProviderColumns", () => {
  it("returns no lines for an empty list", () => {
    expect(formatProviderColumns([])).toEqual([]);
  });

  it("packs ids into multiple columns within the width", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const lines = formatProviderColumns(ids, 20, 2);
    // Every id appears exactly once across all lines.
    const seen = lines.join(" ").split(/\s+/).filter(Boolean).sort();
    expect(seen).toEqual([...ids].sort());
    // Lines fit the width.
    expect(lines.every((l) => l.length <= 20)).toBe(true);
  });

  it("falls back to one column when ids are wider than the width", () => {
    const ids = ["averylongproviderid", "anotherlongproviderid"];
    const lines = formatProviderColumns(ids, 10);
    expect(lines).toHaveLength(2);
  });
});
