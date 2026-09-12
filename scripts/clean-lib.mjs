import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = resolve(root, "dist");

// Library builds own only dist. The site output is intentionally kept for
// independent site builds and previews.
rmSync(dist, { recursive: true, force: true });
