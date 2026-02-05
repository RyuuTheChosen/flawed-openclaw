export const IPC = {
	DRAG_MOVE: "avatar:drag-move",
	SET_IGNORE_MOUSE: "avatar:set-ignore-mouse",
	GET_VRM_PATH: "avatar:get-vrm-path",
	VRM_MODEL_CHANGED: "avatar:vrm-model-changed",
	SHOW_CONTEXT_MENU: "avatar:show-context-menu",
	GET_CAMERA_ZOOM: "avatar:get-camera-zoom",
	SAVE_CAMERA_ZOOM: "avatar:save-camera-zoom",
	SET_CAMERA_ZOOM: "avatar:set-camera-zoom",
	AGENT_STATE: "avatar:agent-state",
	GET_ANIMATIONS_CONFIG: "avatar:get-animations-config",
	SEND_CHAT: "avatar:send-chat",
} as const;
