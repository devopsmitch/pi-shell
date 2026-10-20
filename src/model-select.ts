/**
 * Pure helpers for command handling, separated from I/O so they are unit
 * testable without the Pi SDK, a session, or a terminal.
 */
import type { Api, Model } from "@earendil-works/pi-ai";

/** A minimal model shape for matching/labelling (what the UI actually uses). */
export interface ModelRef {
  id: string;
  name: string;
  provider: string;
}

/**
 * Pi uses a placeholder model with provider/id "unknown" when nothing is
 * authenticated. Treat that as "no model selected".
 */
export function hasRealModel(model: Model<Api> | undefined): model is Model<Api> {
  return !!model && model.provider !== "unknown" && model.id !== "unknown";
}

/** Human-readable label for a model, or a hint when none is selected. */
export function modelLabel(model: Model<Api> | undefined): string {
  return hasRealModel(model)
    ? `${model.provider}/${model.id}`
    : "(none — use /login then /model)";
}

/** Whether two model refs identify the same model. */
export function sameModel(a: ModelRef | undefined, b: ModelRef): boolean {
  return !!a && a.id === b.id && a.provider === b.provider;
}

/**
 * Find models whose id, name, or "provider/id" contains `query`
 * (case-insensitive). An empty query matches nothing (callers list instead).
 */
export function matchModels<T extends ModelRef>(models: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return models.filter(
    (m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      `${m.provider}/${m.id}`.toLowerCase().includes(q),
  );
}
