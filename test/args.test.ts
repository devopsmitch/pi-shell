import { describe, expect, it } from "vitest";
import { parseOptions } from "../src/args.ts";

describe("parseOptions", () => {
  it("defaults to no flags", () => {
    expect(parseOptions([])).toEqual({ fresh: false, inMemory: false });
  });

  it("recognizes --new and its -n alias", () => {
    expect(parseOptions(["--new"]).fresh).toBe(true);
    expect(parseOptions(["-n"]).fresh).toBe(true);
  });

  it("recognizes --in-memory", () => {
    expect(parseOptions(["--in-memory"]).inMemory).toBe(true);
  });

  it("combines flags and ignores unknown ones", () => {
    expect(parseOptions(["--new", "--in-memory", "--bogus"])).toEqual({
      fresh: true,
      inMemory: true,
    });
  });
});
