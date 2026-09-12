import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { getSourceFiles } from "./source-fingerprint.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = resolve(root, "artifacts");
const startedAt = new Date().toISOString();
const started = Date.now();
const sourceFiles = getSourceFiles(root);
const tempRoot = mkdtempSync(join(tmpdir(), "open-mindmap-clean-source-"));
const steps = [];

function runStep(name, command, args) {
  const stepStartedAt = new Date().toISOString();
  const stepStarted = Date.now();
  console.log(`[clean-source] ${name}: ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) process.stdout.write(output);
  steps.push({
    name,
    command: [command, ...args].join(" "),
    startedAt: stepStartedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - stepStarted,
    exitCode,
    signal: result.signal,
  });
  if (exitCode !== 0) {
    throw new Error(`${name} failed with exit code ${exitCode}${result.signal ? ` (${result.signal})` : ""}.`);
  }
}

const report = {
  key: "clean-source-final",
  status: "unknown",
  startedAt,
  finishedAt: null,
  durationMs: null,
  sourceFileCount: sourceFiles.length,
  sourceFiles,
  tempRoot,
  steps,
  limitation: "The clean checkout uses the invoking pnpm and Node toolchain.",
};

try {
  for (const path of sourceFiles) {
    const destination = resolve(tempRoot, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(root, path), destination, { force: true });
  }
  runStep("frozen install", "pnpm", ["install", "--frozen-lockfile"]);
  runStep("library build", "pnpm", ["build:lib"]);
  runStep("site check", "pnpm", ["--dir", "site", "check"]);
  runStep("site build", "pnpm", ["--dir", "site", "build"]);
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = error instanceof Error ? error.message : String(error);
  console.error(`[clean-source] ${report.error}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  report.tempRootRemoved = true;
  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(resolve(artifacts, "clean-source.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[clean-source] ${report.status}; copied ${sourceFiles.length} source files; temporary checkout removed.`);
}
