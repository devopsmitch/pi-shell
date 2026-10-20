import { describe, expect, it } from "vitest";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  hasRealModel,
  matchModels,
  modelLabel,
  type ModelRef,
  sameModel,
} from "../src/model-select.ts";

/** Build a minimal Model stub for label/guard tests. */
function model(provider: string, id: string, name = id): Model<Api> {
  return { provider, id, name } as unknown as Model<Api>;
}

const MODELS: ModelRef[] = [
  { provider: "anthropic", id: "claude-sonnet-4", name: "Claude Sonnet 4" },
  { provider: "anthropic", id: "claude-opus-4", name: "Claude Opus 4" },
  { provider: "openai", id: "gpt-5", name: "GPT-5" },
  { provider: "openrouter", id: "x-ai/grok-4", name: "Grok 4" },
];

describe("hasRealModel", () => {
  it("is false for undefined", () => {
    expect(hasRealModel(undefined)).toBe(false);
  });

  it('is false for the "unknown" placeholder', () => {
    expect(hasRealModel(model("unknown", "unknown"))).toBe(false);
  });

  it("is true for a real model", () => {
    expect(hasRealModel(model("openai", "gpt-5"))).toBe(true);
  });
});

describe("modelLabel", () => {
  it("formats provider/id for a real model", () => {
    expect(modelLabel(model("openai", "gpt-5"))).toBe("openai/gpt-5");
  });

  it("returns a hint when there is no real model", () => {
    expect(modelLabel(undefined)).toContain("none");
    expect(modelLabel(model("unknown", "unknown"))).toContain("none");
  });
});

describe("sameModel", () => {
  it("matches on provider and id", () => {
    expect(sameModel({ provider: "openai", id: "gpt-5", name: "x" }, MODELS[2]!)).toBe(true);
  });

  it("does not match different providers with the same id", () => {
    expect(
      sameModel({ provider: "azure", id: "gpt-5", name: "x" }, MODELS[2]!),
    ).toBe(false);
  });

  it("is false for undefined current", () => {
    expect(sameModel(undefined, MODELS[0]!)).toBe(false);
  });
});

describe("matchModels", () => {
  it("returns nothing for an empty query", () => {
    expect(matchModels(MODELS, "")).toEqual([]);
    expect(matchModels(MODELS, "   ")).toEqual([]);
  });

  it("matches on id substring, case-insensitively", () => {
    expect(matchModels(MODELS, "OPUS").map((m) => m.id)).toEqual(["claude-opus-4"]);
  });

  it("matches on display name", () => {
    expect(matchModels(MODELS, "grok").map((m) => m.id)).toEqual(["x-ai/grok-4"]);
  });

  it("matches on provider/id", () => {
    expect(matchModels(MODELS, "openai/gpt").map((m) => m.id)).toEqual(["gpt-5"]);
  });

  it("can return multiple matches (ambiguous)", () => {
    expect(matchModels(MODELS, "claude")).toHaveLength(2);
  });
});
