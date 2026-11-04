import { describe, expect, it } from "vitest";
import { discoverNodeModulesExtensions } from "../src/extensions.ts";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "pi-ext-test-"));
}

describe("discoverNodeModulesExtensions", () => {
  it("returns empty for a directory without node_modules", () => {
    const dir = makeTmpDir();
    try {
      expect(discoverNodeModulesExtensions(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("discovers a package with pi.extensions manifest", () => {
    const dir = makeTmpDir();
    try {
      const pkgDir = join(dir, "node_modules", "pi-provider-test");
      const distDir = join(pkgDir, "dist");
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, "index.js"), "export default function() {}");
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "pi-provider-test", pi: { extensions: ["./dist/index.js"] } }),
      );

      const paths = discoverNodeModulesExtensions(dir);
      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain("pi-provider-test");
      expect(paths[0]).toContain("index.js");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("ignores packages without a pi manifest", () => {
    const dir = makeTmpDir();
    try {
      const pkgDir = join(dir, "node_modules", "some-lib");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "some-lib" }),
      );

      expect(discoverNodeModulesExtensions(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("discovers scoped packages", () => {
    const dir = makeTmpDir();
    try {
      const pkgDir = join(dir, "node_modules", "@myorg", "pi-ext");
      const distDir = join(pkgDir, "dist");
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(distDir, "ext.js"), "export default function() {}");
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "@myorg/pi-ext", pi: { extensions: ["./dist/ext.js"] } }),
      );

      const paths = discoverNodeModulesExtensions(dir);
      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain("@myorg");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("skips extensions whose files do not exist", () => {
    const dir = makeTmpDir();
    try {
      const pkgDir = join(dir, "node_modules", "pi-broken");
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "pi-broken", pi: { extensions: ["./dist/missing.js"] } }),
      );

      expect(discoverNodeModulesExtensions(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
