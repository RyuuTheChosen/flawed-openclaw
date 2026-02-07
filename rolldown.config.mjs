import { defineConfig } from "rolldown";

export default defineConfig([
	{
		input: "dist/renderer/renderer/renderer.js",
		output: {
			file: "dist/renderer-bundle/renderer.js",
			format: "esm",
			inlineDynamicImports: true,
		},
		resolve: {
			extensions: [".js", ".mjs"],
		},
	},
	{
		input: "dist/renderer/renderer/audio/kokoro-worker.js",
		output: {
			file: "dist/renderer-bundle/kokoro-worker.js",
			format: "esm",
			inlineDynamicImports: true,
		},
		resolve: {
			extensions: [".js", ".mjs"],
		},
	},
	{
		input: "dist/renderer/renderer/chat-window/chat-renderer.js",
		output: {
			file: "dist/chat-renderer-bundle/chat-renderer.js",
			format: "esm",
		},
		resolve: {
			extensions: [".js", ".mjs"],
		},
	},
	{
		input: "dist/renderer/renderer/settings-window/settings-renderer.js",
		output: {
			file: "dist/settings-renderer-bundle/settings-renderer.js",
			format: "esm",
		},
		resolve: {
			extensions: [".js", ".mjs"],
		},
	},
]);
