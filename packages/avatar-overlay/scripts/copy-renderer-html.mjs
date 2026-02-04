import { cpSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const rendererDest = join(root, "dist", "renderer-bundle");

mkdirSync(rendererDest, { recursive: true });
cpSync(
	join(root, "src", "renderer", "index.html"),
	join(rendererDest, "index.html"),
);

// Copy preload.cjs to dist/
cpSync(
	join(root, "src", "main", "preload.cjs"),
	join(root, "dist", "preload.cjs"),
);
