import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createAvatarOverlayService } from "./src/service.js";

const plugin = {
	id: "avatar-overlay",
	name: "Avatar Overlay",
	description: "3D avatar overlay that gives your agent a face",
	register(api: OpenClawPluginApi) {
		const service = createAvatarOverlayService(api);
		api.registerService(service);

		api.registerCommand({
			name: "avatar_show",
			description: "Show the avatar overlay window",
			handler: () => {
				service.send({ type: "show" });
				return { text: "Avatar shown" };
			},
		});

		api.registerCommand({
			name: "avatar_hide",
			description: "Hide the avatar overlay window",
			handler: () => {
				service.send({ type: "hide" });
				return { text: "Avatar hidden" };
			},
		});
	},
};

export default plugin;
