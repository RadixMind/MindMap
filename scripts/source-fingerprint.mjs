import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));

function isExcluded(path) {
  const name = basename(path);
  const segments = path.split("/");
  return (
    segments.includes("dist") ||
    segments.includes("node_modules") ||
    segments.includes(".git") ||
    segments.includes("artifacts") ||
    segments.includes("logs") ||
    path === "site/.astro" ||
    path.startsWith("site/.astro/") ||
    name === ".DS_Store" ||
    name.endsWith(".log") ||
    name.endsWith(".status") ||
    name.endsWith(".meta.json")
  );
}

export function getSourceFiles(projectRoot = root) {
  const result = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
    cwd: projectRoot,
  });

  if (result.status !== 0 || !result.stdout) {
    throw new Error(result.stderr?.toString("utf8") || "Unable to list project source files.");
  }

  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => !isExcluded(path))
    .filter((path) => {
      try {
        return statSync(resolve(projectRoot, path)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}

export function getSourceFingerprint(projectRoot = root) {
  const files = getSourceFiles(projectRoot);
  const hash = createHash("sha256");

  for (const path of files) {
    const contents = readFileSync(resolve(projectRoot, path));
    hash.update(path);
    hash.update("\0");
    hash.update(String(contents.byteLength));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }

  return {
    algorithm: "sha256",
    value: hash.digest("hex"),
    fileCount: files.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(getSourceFingerprint())}\n`);
}
