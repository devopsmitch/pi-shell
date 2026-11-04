/**
 * Auto-discover Pi extension packages installed in node_modules.
 *
 * Pi's full TUI discovers extensions from settings and `pi install`. pi-shell
 * doesn't have that flow, so we scan direct dependencies for packages that
 * declare `"pi".extensions` in their package.json and resolve those paths so
 * the DefaultResourceLoader can load them.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Scan the project's node_modules for packages whose package.json contains
 * a `"pi".extensions` array. Returns the resolved extension entry-point paths.
 */
export function discoverNodeModulesExtensions(cwd: string): string[] {
  const nodeModules = join(cwd, "node_modules");
  if (!existsSync(nodeModules)) return [];

  const paths: string[] = [];

  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    // Handle scoped packages (@scope/name)
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scopeDir = join(nodeModules, entry.name);
      for (const scoped of readdirSync(scopeDir, { withFileTypes: true })) {
        if (scoped.isDirectory()) {
          paths.push(...extractExtensionPaths(join(scopeDir, scoped.name)));
        }
      }
      continue;
    }

    if (entry.isDirectory() || entry.isSymbolicLink()) {
      paths.push(...extractExtensionPaths(join(nodeModules, entry.name)));
    }
  }

  return paths;
}

/** Read a package's pi manifest and resolve its extension paths. */
function extractExtensionPaths(pkgDir: string): string[] {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return [];

  try {
    const manifest = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const piExtensions: unknown = manifest?.pi?.extensions;
    if (!Array.isArray(piExtensions)) return [];

    return piExtensions
      .filter((p): p is string => typeof p === "string")
      .map((p) => resolve(pkgDir, p))
      .filter((p) => existsSync(p));
  } catch {
    return [];
  }
}
