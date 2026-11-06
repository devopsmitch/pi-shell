import { describe, expect, it } from "vitest";
import { completePath, makeReplCompleter, type ListDir } from "../src/completion.ts";

/** Fake filesystem: map of dir -> entries, for injecting into completePath. */
function fakeListDir(tree: Record<string, { name: string; isDir: boolean }[]>): ListDir {
  return (dir) => tree[dir] ?? [];
}

const tree = {
  "": [
    { name: "src", isDir: true },
    { name: "README.md", isDir: false },
    { name: ".gitignore", isDir: false },
    { name: "test", isDir: true },
  ],
  src: [
    { name: "pi-shell.ts", isDir: false },
    { name: "prompter.ts", isDir: false },
    { name: "providers.ts", isDir: false },
    { name: "args.ts", isDir: false },
  ],
};

describe("completePath", () => {
  it("completes a top-level prefix, appending / to directories", () => {
    const [matches, frag] = completePath("sr", fakeListDir(tree));
    expect(matches).toEqual(["src/"]);
    expect(frag).toBe("sr");
  });

  it("lists a directory's contents when the fragment ends in /", () => {
    const [matches] = completePath("src/", fakeListDir(tree));
    expect(matches).toEqual(["src/args.ts", "src/pi-shell.ts", "src/prompter.ts", "src/providers.ts"]);
  });

  it("completes a prefix inside a subdirectory", () => {
    const [matches, frag] = completePath("src/p", fakeListDir(tree));
    expect(matches).toEqual(["src/pi-shell.ts", "src/prompter.ts", "src/providers.ts"]);
    expect(frag).toBe("src/p");
  });

  it("hides dotfiles unless the prefix starts with a dot", () => {
    expect(completePath("", fakeListDir(tree))[0]).toEqual(["README.md", "src/", "test/"]);
    expect(completePath(".", fakeListDir(tree))[0]).toEqual([".gitignore "]);
  });

  it("returns no matches for an unknown prefix", () => {
    expect(completePath("zzz", fakeListDir(tree))[0]).toEqual([]);
  });

  it("appends a trailing space to a lone file match", () => {
    expect(completePath("READ", fakeListDir(tree))[0]).toEqual(["README.md "]);
  });

  it("keeps the trailing slash (no space) for a lone directory match", () => {
    expect(completePath("sr", fakeListDir(tree))[0]).toEqual(["src/"]);
  });
});

describe("makeReplCompleter", () => {
  const complete = makeReplCompleter(fakeListDir(tree));

  it("completes the last whitespace-delimited token", () => {
    const [matches, frag] = complete({ line: "look at src/p" });
    expect(matches).toEqual(["src/pi-shell.ts", "src/prompter.ts", "src/providers.ts"]);
    expect(frag).toBe("src/p");
  });

  it("completes a bare fragment at the start of the line", () => {
    const [matches, frag] = complete({ line: "sr" });
    expect(matches).toEqual(["src/"]);
    expect(frag).toBe("sr");
  });
});
