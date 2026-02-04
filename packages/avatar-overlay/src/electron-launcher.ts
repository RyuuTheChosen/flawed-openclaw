import * as path from "node:path";
import { createRequire } from "node:module";

/**
 * Resolve the path to the Electron binary from the plugin's own node_modules.
 */
export function resolveElectronBinary(pluginDir: string): string {
	const require = createRequire(path.join(pluginDir, "package.json"));
	// electron package exports a string path to the binary
	return require("electron") as unknown as string;
}

/**
 * Resolve the compiled Electron main entry script.
 */
export function resolveElectronMain(pluginDir: string): string {
	return path.resolve(pluginDir, "dist", "main", "main", "main.js");
}

/**
 * Build CLI arguments for the Electron child process.
 */
export function buildElectronArgs(opts: {
	mainEntry: string;
	gatewayUrl?: string;
	vrmPath?: string;
	agentConfigs?: string;
}): string[] {
	const args = [opts.mainEntry];
	if (opts.gatewayUrl) {
		args.push(`--gateway-url=${opts.gatewayUrl}`);
	}
	if (opts.vrmPath) {
		args.push(`--vrm-path=${opts.vrmPath}`);
	}
	if (opts.agentConfigs) {
		args.push(`--agent-configs=${opts.agentConfigs}`);
	}
	return args;
}
