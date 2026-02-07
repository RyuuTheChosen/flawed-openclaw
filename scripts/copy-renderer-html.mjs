import { cpSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const rendererDest = join(root, "dist", "renderer-bundle");
const chatRendererDest = join(root, "dist", "chat-renderer-bundle");
const stylesDest = join(rendererDest, "styles");
const chatStylesDest = join(chatRendererDest, "styles");

mkdirSync(rendererDest, { recursive: true });
mkdirSync(chatRendererDest, { recursive: true });
mkdirSync(stylesDest, { recursive: true });
mkdirSync(chatStylesDest, { recursive: true });

cpSync(
	join(root, "src", "renderer", "index.html"),
	join(rendererDest, "index.html"),
);

// Copy chat window HTML
cpSync(
	join(root, "src", "renderer", "chat-window", "chat-index.html"),
	join(chatRendererDest, "chat-index.html"),
);

// Copy CSS files to both renderer bundles
cpSync(
	join(root, "src", "renderer", "styles"),
	stylesDest,
	{ recursive: true },
);
cpSync(
	join(root, "src", "renderer", "styles"),
	chatStylesDest,
	{ recursive: true },
);

// Copy preload.cjs to dist/
cpSync(
	join(root, "src", "main", "preload.cjs"),
	join(root, "dist", "preload.cjs"),
);

// Copy chat-preload.cjs to dist/
cpSync(
	join(root, "src", "main", "chat-preload.cjs"),
	join(root, "dist", "chat-preload.cjs"),
);

// Settings window
const settingsRendererDest = join(root, "dist", "settings-renderer-bundle");
const settingsStylesDest = join(settingsRendererDest, "styles");
mkdirSync(settingsRendererDest, { recursive: true });
mkdirSync(settingsStylesDest, { recursive: true });
cpSync(
	join(root, "src", "renderer", "settings-window", "settings-index.html"),
	join(settingsRendererDest, "settings-index.html"),
);
cpSync(
	join(root, "src", "renderer", "styles"),
	settingsStylesDest,
	{ recursive: true },
);

// Copy settings-preload.cjs to dist/
cpSync(
	join(root, "src", "main", "settings-preload.cjs"),
	join(root, "dist", "settings-preload.cjs"),
);
