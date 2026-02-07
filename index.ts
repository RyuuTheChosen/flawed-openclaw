import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createFlawedAvatarService } from "./src/service.js";

const plugin = {
	id: "flawed-avatar",
	name: "Flawed Avatar",
	description: "3D avatar overlay that gives your agent a face",
	register(api: OpenClawPluginApi) {
		const service = createFlawedAvatarService(api);
		api.registerService(service);

		api.registerCommand({
			name: "flawed_show",
			description: "Show the avatar overlay window",
			handler: () => {
				service.send({ type: "show" });
				return { text: "Avatar shown" };
			},
		});

		api.registerCommand({
			name: "flawed_hide",
			description: "Hide the avatar overlay window",
			handler: () => {
				service.send({ type: "hide" });
				return { text: "Avatar hidden" };
			},
		});
	},
};

export default plugin;
