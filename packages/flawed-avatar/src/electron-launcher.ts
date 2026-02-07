import * as path from "node:path";
import { createRequire } from "node:module";

const WS_URL_RE = /^wss?:\/\//;

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
	authToken?: string;
}): string[] {
	const args = [opts.mainEntry];
	if (opts.gatewayUrl) {
		if (!WS_URL_RE.test(opts.gatewayUrl)) {
			throw new Error(`Invalid gateway URL: must start with ws:// or wss://`);
		}
		args.push(`--gateway-url=${opts.gatewayUrl}`);
	}
	if (opts.vrmPath) {
		const resolved = path.resolve(opts.vrmPath);
		if (!path.isAbsolute(resolved) || resolved.includes("..")) {
			throw new Error(`Invalid VRM path: must be absolute with no '..' segments`);
		}
		args.push(`--vrm-path=${resolved}`);
	}
	if (opts.agentConfigs) {
		// Validate JSON structure and reject prototype pollution keys
		const parsed = JSON.parse(opts.agentConfigs);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			throw new Error("Invalid agentConfigs: must be a JSON object");
		}
		for (const key of Object.keys(parsed)) {
			if (key === "__proto__" || key === "constructor" || key === "prototype") {
				throw new Error(`Invalid agentConfigs: forbidden key '${key}'`);
			}
		}
		args.push(`--agent-configs=${opts.agentConfigs}`);
	}
	if (opts.authToken) {
		args.push(`--auth-token=${opts.authToken}`);
	}
	return args;
}
