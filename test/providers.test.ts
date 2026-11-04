import { describe, expect, it } from "vitest";
import type { Provider } from "@earendil-works/pi-ai";
import {
  authMethodOptions,
  formatProviderColumns,
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
    const info = toProviderInfo(provider("groq", "Groq", { apiKey: true }));
    expect(info.authTypes).toEqual(["api_key"]);
    expect(info.oauthName).toBeUndefined();
  });

  it("reports oauth only", () => {
    const info = toProviderInfo(provider("openai-codex", "Codex", { oauth: true }));
    expect(info.authTypes).toEqual(["oauth"]);
    expect(info.oauthName).toBe("Codex OAuth");
  });

  it("prefers oauth first for subscription providers", () => {
    const info = toProviderInfo(
      provider("anthropic", "Anthropic", { apiKey: true, oauth: true, subscription: true }),
    );
    expect(info.authTypes).toEqual(["oauth", "api_key"]);
    expect(info.oauthName).toBe("Anthropic OAuth");
  });

  it("prefers api_key first when oauth is not a subscription", () => {
    const info = toProviderInfo(
      provider("openrouter", "OpenRouter", { apiKey: true, oauth: true }),
    );
    expect(info.authTypes).toEqual(["api_key", "oauth"]);
    expect(info.oauthName).toBe("OpenRouter OAuth");
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

describe("authMethodOptions", () => {
  it("labels api_key plainly and oauth by its display name", () => {
    const info = toProviderInfo(provider("kiro", "Kiro", { apiKey: true, oauth: true }));
    expect(authMethodOptions(info)).toEqual([
      { id: "api_key", label: "API key" },
      { id: "oauth", label: "Kiro OAuth" },
    ]);
  });

  it("keeps the provider's auth-type order", () => {
    const info = toProviderInfo(
      provider("anthropic", "Anthropic", { apiKey: true, oauth: true, subscription: true }),
    );
    expect(authMethodOptions(info).map((o) => o.id)).toEqual(["oauth", "api_key"]);
  });

  it("falls back to a generic oauth label when the name is missing", () => {
    expect(authMethodOptions({ id: "x", name: "X", authTypes: ["oauth"] })).toEqual([
      { id: "oauth", label: "OAuth" },
    ]);
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
