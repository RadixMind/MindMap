import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { getSourceFingerprint } from "./source-fingerprint.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = resolve(root, "artifacts");
const [key, separator, ...command] = process.argv.slice(2);

if (!key || separator !== "--" || !command.length) {
  console.error("Usage: node scripts/run-check.mjs <key> -- <command> [args...]");
  process.exitCode = 2;
} else {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const finishedAt = new Date().toISOString();
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const gitHeadResult = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  const gitHead = gitHeadResult.status === 0 ? gitHeadResult.stdout.trim() : "unavailable";
  let sourceFingerprint;
  try {
    sourceFingerprint = getSourceFingerprint(root);
  } catch {
    sourceFingerprint = { algorithm: "sha256", value: "unavailable", fileCount: null };
  }
  const metadata = {
    key,
    command: command.join(" "),
    startedAt,
    finishedAt,
    durationMs: Date.now() - started,
    exitCode,
    signal: result.signal,
    gitHead,
    sourceFingerprint: sourceFingerprint.value,
    sourceFingerprintAlgorithm: sourceFingerprint.algorithm,
    sourceFileCount: sourceFingerprint.fileCount,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: root,
    },
    fixture: process.env.OPEN_MINDMAP_CHECK_FIXTURE ? JSON.parse(process.env.OPEN_MINDMAP_CHECK_FIXTURE) : undefined,
    limitation: process.env.OPEN_MINDMAP_CHECK_LIMITATION,
  };
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(resolve(artifacts, `${key}.log`), `${result.stdout ?? ""}${result.stderr ?? ""}`);
  writeFileSync(resolve(artifacts, `${key}.meta.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  writeFileSync(resolve(artifacts, `${key}.status`), `${JSON.stringify(metadata, null, 2)}\n`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = exitCode;
}
