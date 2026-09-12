import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "dist");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const entries = {
  root: "index",
  core: "core",
  static: "static",
  viewer: "viewer",
  editor: "editor",
  history: "features/history",
  search: "features/search",
  import: "features/import",
  export: "features/export",
  markdownEditor: "features/markdown-editor",
  ai: "features/ai",
  extensions: "extensions/index",
  crossLink: "extensions/cross-link",
  tags: "extensions/tags",
  folding: "extensions/folding",
  frontmatter: "extensions/frontmatter",
  latex: "extensions/latex",
  multiline: "extensions/multiline",
  dottedLine: "extensions/dotted-line",
};

const dynamicImportPattern = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g;
const dynamicRequirePattern = /Promise\.resolve\(\)\.then\((?:\(\)\s*=>|[^)]*=>)\s*require\s*\(\s*["'`]([^"'`]+)["'`]/g;
const staticImportPattern = /(?:\bfrom\s*|\bimport\s*|\brequire\s*\()\s*["'`]([^"'`]+)["'`]/g;

function relativePath(path) {
  return relative(dist, path).replaceAll("\\", "/");
}

function resolveImport(from, specifier) {
  if (!specifier.startsWith(".")) return null;
  const cleanSpecifier = specifier.split("?", 1)[0].split("#", 1)[0];
  const candidate = resolve(dirname(from), cleanSpecifier);
  const candidates = [candidate, `${candidate}.js`, `${candidate}.cjs`, resolve(candidate, "index.js")];
  return candidates.find((path) => existsSync(path) && [".js", ".cjs"].includes(extname(path))) ?? null;
}

function importsIn(code) {
  const imports = [];
  const dynamicRanges = [];
  for (const pattern of [dynamicImportPattern, dynamicRequirePattern]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(code))) {
      imports.push({ specifier: match[1], dynamic: true });
      dynamicRanges.push([match.index, pattern.lastIndex]);
    }
  }
  staticImportPattern.lastIndex = 0;
  let match;
  while ((match = staticImportPattern.exec(code))) {
    if (!dynamicRanges.some(([start, end]) => match.index >= start && match.index < end)) {
      imports.push({ specifier: match[1], dynamic: false });
    }
  }
  return imports;
}

function graph(entry) {
  const eager = new Set();
  const lazy = new Set();
  const lazyImports = [];
  const visit = (file, isLazy) => {
    const visited = isLazy ? lazy : eager;
    if (!file || visited.has(file) || !existsSync(file) || ![".js", ".cjs"].includes(extname(file))) return;
    visited.add(file);
    const code = readFileSync(file, "utf8");
    for (const { specifier, dynamic } of importsIn(code)) {
      const target = resolveImport(file, specifier);
      if (dynamic) lazyImports.push({ from: relativePath(file), to: target ? relativePath(target) : specifier });
      visit(target, isLazy || dynamic);
    }
  };

  if (!existsSync(entry)) throw new Error(`Missing build entry: ${relativePath(entry)}`);
  visit(entry);
  const files = [...eager];
  const lazyFiles = [...lazy].filter((file) => !eager.has(file));
  const raw = files.reduce((sum, file) => sum + statSync(file).size, 0);
  const gzip = gzipSync(Buffer.concat(files.map((file) => readFileSync(file)))).length;
  const lazyRaw = lazyFiles.reduce((sum, file) => sum + statSync(file).size, 0);
  const lazyGzip = lazyFiles.length ? gzipSync(Buffer.concat(lazyFiles.map((file) => readFileSync(file)))).length : 0;
  return { raw, gzip, files: files.map(relativePath), lazyRaw, lazyGzip, lazyFiles: lazyFiles.map(relativePath), lazyImports };
}

const manifest = {
  generatedAt: new Date().toISOString(),
  version: packageJson.version,
  entries: {},
};

for (const [name, stem] of Object.entries(entries)) {
  const es = graph(resolve(dist, `${stem}.js`));
  const cjs = graph(resolve(dist, `${stem}.cjs`));
  manifest.entries[name] = { ...es, formats: { es, cjs } };
}

writeFileSync(resolve(dist, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
