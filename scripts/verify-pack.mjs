import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const temp = mkdtempSync(join(tmpdir(), "open-mindmap-pack-"));
const packageName = packageJson.name;

function packageSpecifier(subpath) {
  return subpath === "." ? packageName : `${packageName}${subpath.slice(1)}`;
}

function targetEntries() {
  return Object.entries(packageJson.exports ?? {}).flatMap(([subpath, config]) => {
    if (typeof config === "string") return [{ subpath, condition: "default", target: config, type: "string" }];
    return Object.entries(config ?? {}).map(([condition, target]) => ({ subpath, condition, target, type: "condition" }));
  });
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return result;
}

try {
  mkdirSync(temp, { recursive: true });
  const packageDestination = join(temp, "archive");
  mkdirSync(packageDestination, { recursive: true });
  run("pnpm", ["pack", "--pack-destination", packageDestination], { stdio: ["ignore", "pipe", "pipe"] });

  const tarballs = readdirSync(packageDestination).filter((file) => file.endsWith(".tgz"));
  if (tarballs.length !== 1) throw new Error(`Expected one package archive, found ${tarballs.length}`);
  const tarball = join(packageDestination, tarballs[0]);
  const extracted = join(temp, "extracted");
  mkdirSync(extracted, { recursive: true });
  run("tar", ["-xzf", tarball, "-C", extracted]);
  const packedRoot = join(extracted, "package");
  const packedPackage = JSON.parse(readFileSync(join(packedRoot, "package.json"), "utf8"));

  const entries = targetEntries();
  const missing = [];
  for (const { subpath, condition, target } of entries) {
    if (typeof target !== "string") {
      missing.push(`${subpath}.${condition}: target is not a string`);
      continue;
    }
    if (!existsSync(join(packedRoot, target))) missing.push(`${subpath}.${condition}: ${target}`);
  }
  if (missing.length) throw new Error(`Package archive is missing declared targets:\n${missing.join("\n")}`);

  const forbidden = [];
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const relativePath = path.slice(packedRoot.length + 1).replaceAll("\\", "/");
        files.push(relativePath);
        if (/legacy-viewer|cognitive-runtime|cognitive\/react/.test(relativePath)) forbidden.push(relativePath);
      }
    }
  };
  walk(packedRoot);
  if (forbidden.length) throw new Error(`Package archive includes retired artifacts: ${forbidden.join(", ")}`);

  const brokenReadmeLinks = [];
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const readme of ["README.md", "README.zh-CN.md"]) {
    const content = readFileSync(join(packedRoot, readme), "utf8");
    markdownLinkPattern.lastIndex = 0;
    let match;
    while ((match = markdownLinkPattern.exec(content))) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^(?:[a-z]+:|\/\/|#)/i.test(target)) continue;
      const decoded = decodeURIComponent(target);
      if (!existsSync(resolve(packedRoot, decoded))) brokenReadmeLinks.push(`${readme}: ${target}`);
    }
  }
  if (brokenReadmeLinks.length) throw new Error(`Packed README links are broken:\n${brokenReadmeLinks.join("\n")}`);

  const consumer = join(temp, "consumer");
  const consumerNodeModules = join(consumer, "node_modules");
  const scopedModules = join(consumerNodeModules, "@xiangfa");
  const packedNodeModules = join(packedRoot, "node_modules");
  mkdirSync(scopedModules, { recursive: true });
  mkdirSync(packedNodeModules, { recursive: true });
  symlinkSync(packedRoot, join(scopedModules, "mindmap"), "junction");
  for (const dependency of ["react", "react-dom"]) {
    const source = resolve(root, "node_modules", dependency);
    if (existsSync(source)) {
      symlinkSync(source, join(consumerNodeModules, dependency), "junction");
      symlinkSync(source, join(packedNodeModules, dependency), "junction");
    }
  }

  const jsEntries = entries.filter(({ target }) => typeof target === "string" && !target.endsWith(".css"));
  const importSpecifiers = jsEntries.filter(({ condition }) => condition === "import").map(({ subpath }) => packageSpecifier(subpath));
  const requireSpecifiers = jsEntries.filter(({ condition }) => condition === "require").map(({ subpath }) => packageSpecifier(subpath));
  const importSmoke = join(consumer, "import-smoke.mjs");
  writeFileSync(importSmoke, `${importSpecifiers.map((specifier) => `await import(${JSON.stringify(specifier)});`).join("\n")}\n`);
  run(process.execPath, [importSmoke], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });

  const requireSmoke = join(consumer, "require-smoke.cjs");
  writeFileSync(requireSmoke, `${requireSpecifiers.map((specifier) => `require(${JSON.stringify(specifier)});`).join("\n")}\n`);
  run(process.execPath, [requireSmoke], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });

  const typeSpecifiers = jsEntries.filter(({ condition }) => condition === "types").map(({ subpath }) => packageSpecifier(subpath));
  const typeSource = typeSpecifiers.map((specifier) => `import * as entry_${typeSpecifiers.indexOf(specifier)} from ${JSON.stringify(specifier)}; void entry_${typeSpecifiers.indexOf(specifier)};`).join("\n");
  const typeFile = join(consumer, "types-smoke.ts");
  const tsConfig = join(consumer, "tsconfig.json");
  writeFileSync(typeFile, `${typeSource}\n`);
  writeFileSync(tsConfig, JSON.stringify({
    compilerOptions: {
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      typeRoots: [resolve(root, "node_modules/@types")],
    },
    files: [typeFile],
  }, null, 2));
  const tsc = resolve(root, "node_modules/.bin/tsc");
  if (!existsSync(tsc)) throw new Error(`TypeScript compiler not found at ${tsc}`);
  run(tsc, ["--project", tsConfig], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });

  const cssTargets = entries.filter(({ target }) => typeof target === "string" && target.endsWith(".css"));
  if (cssTargets.some(({ target }) => !existsSync(join(packedRoot, target)))) {
    throw new Error("One or more declared CSS exports are missing from the package archive");
  }

  if (packedPackage.version !== packageJson.version) {
    throw new Error(`Packed version ${packedPackage.version} does not match ${packageJson.version}`);
  }
  console.log(JSON.stringify({ tarball: tarballs[0], files: files.length, exports: entries.length, passed: true }, null, 2));
} finally {
  rmSync(temp, { recursive: true, force: true });
}
