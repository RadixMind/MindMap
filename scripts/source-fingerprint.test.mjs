import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { getSourceFiles } from "./source-fingerprint.mjs";

describe("getSourceFiles", () => {
  it("omits tracked deletions while retaining untracked source files", () => {
    const repository = mkdtempSync(join(tmpdir(), "open-mindmap-source-files-"));
    try {
      execFileSync("git", ["init", "-q"], { cwd: repository });
      writeFileSync(join(repository, "tracked.txt"), "tracked");
      execFileSync("git", ["add", "tracked.txt"], { cwd: repository });
      rmSync(join(repository, "tracked.txt"));
      writeFileSync(join(repository, "untracked.ts"), "export {};");
      mkdirSync(join(repository, "artifacts"));
      writeFileSync(join(repository, "artifacts", "generated.json"), "{}");

      expect(getSourceFiles(repository)).toEqual(["untracked.ts"]);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  });
});
