/**
 * Pure helpers for presenting and choosing upstream providers.
 *
 * The provider list, display names, and auth methods all come from Pi's
 * ModelRuntime.getProviders(); these helpers only shape that data for the
 * terminal. Keeping them I/O-free makes them unit testable.
 */
import type { AuthType, Provider } from "@earendil-works/pi-ai";

/** The provider facts pi-shell needs, distilled from a Provider. */
export interface ProviderInfo {
  id: string;
  name: string;
  /** Auth methods the provider supports, in preference order. */
  authTypes: AuthType[];
}

/** Distil a Provider into the id/name/authTypes pi-shell uses. */
export function toProviderInfo(provider: Provider): ProviderInfo {
  const authTypes: AuthType[] = [];
  // Prefer OAuth for subscription providers; otherwise prefer API key.
  if (provider.auth.oauth?.isSubscription) authTypes.push("oauth");
  if (provider.auth.apiKey) authTypes.push("api_key");
  if (provider.auth.oauth && !authTypes.includes("oauth")) authTypes.push("oauth");
  return { id: provider.id, name: provider.name, authTypes };
}

/** Distil and sort a provider list by id for stable display. */
export function providerInfos(providers: readonly Provider[]): ProviderInfo[] {
  return providers.map(toProviderInfo).sort((a, b) => a.id.localeCompare(b.id));
}

/** The login auth type to attempt for a provider (its first supported method). */
export function preferredAuthType(info: ProviderInfo): AuthType {
  return info.authTypes[0] ?? "api_key";
}

/**
 * Lay out ids into fixed-width columns that fit `width` terminal columns.
 * Returns the formatted lines (without a trailing newline).
 */
export function formatProviderColumns(
  ids: readonly string[],
  width = 80,
  gap = 2,
): string[] {
  if (ids.length === 0) return [];
  const colWidth = Math.max(...ids.map((id) => id.length)) + gap;
  const cols = Math.max(1, Math.floor(width / colWidth));
  const rows = Math.ceil(ids.length / cols);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      // Column-major fill so ids read top-to-bottom then left-to-right.
      const id = ids[c * rows + r];
      if (id) line += id.padEnd(colWidth);
    }
    lines.push(line.trimEnd());
  }
  return lines;
}
