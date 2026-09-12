import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(root, "src/components/MindMap/styles");
const target = resolve(root, "dist/styles");

if (!existsSync(source)) {
  throw new Error(`Cannot copy library styles: ${source} does not exist`);
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

for (const file of filesUnder(source)) {
  const destination = resolve(target, relative(source, file));
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(file, destination);
}
