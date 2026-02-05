export const WINDOW_WIDTH = 300;
export const WINDOW_HEIGHT = 400;
export const WINDOW_POSITION_FILE = "avatar-overlay-position.json";

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 3.5;
export const CAMERA_ZOOM_DEFAULT = 0.8;
export const CAMERA_ZOOM_STEP = 0.15;
export const CAMERA_ZOOM_FILE = "avatar-overlay-camera.json";
export const CAMERA_PRESETS = { head: 0.6, upperBody: 1.2, fullBody: 3.0 } as const;

export const GATEWAY_URL_DEFAULT = "ws://127.0.0.1:18789";
export const GATEWAY_RECONNECT_BASE_MS = 3_000;
export const GATEWAY_RECONNECT_MAX_MS = 30_000;

export const CHAT_IDLE_FADE_MS = 10_000;
export const CHAT_FADE_TRANSITION_MS = 300;
export const CHAT_MAX_HISTORY = 200;
export const CHAT_DOTS_INTERVAL_MS = 400;
export const CHAT_INPUT_MAX_LENGTH = 4096;
