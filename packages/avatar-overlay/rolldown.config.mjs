import { defineConfig } from "rolldown";
import path from "node:path";

export default defineConfig({
	input: "dist/renderer/renderer/renderer.js",
	output: {
		file: "dist/renderer-bundle/renderer.js",
		format: "esm",
	},
	resolve: {
		extensions: [".js", ".mjs"],
	},
});
