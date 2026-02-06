export const WINDOW_WIDTH = 300;
export const WINDOW_HEIGHT = 500;

// === Legacy File Names (for migration) ===
export const WINDOW_POSITION_FILE = "avatar-overlay-position.json";
export const CAMERA_ZOOM_FILE = "avatar-overlay-camera.json";

// === Persistence Files ===
export const SETTINGS_FILE = "avatar-overlay-settings.json";
export const CHAT_HISTORY_FILE = "avatar-overlay-chat.json";

// === Camera Settings ===
export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 3.5;
export const CAMERA_ZOOM_DEFAULT = 0.8;
export const CAMERA_ZOOM_STEP = 0.15;
export const CAMERA_PRESETS = { head: 0.6, upperBody: 1.2, fullBody: 3.0 } as const;

// === Opacity Settings ===
export const OPACITY_MIN = 0.3;
export const OPACITY_MAX = 1.0;
export const OPACITY_DEFAULT = 1.0;

// === Idle Timeout Options (ms) ===
export const IDLE_TIMEOUT_OPTIONS = [5000, 10000, 30000, 0] as const;
export const IDLE_TIMEOUT_DEFAULT = 10000;

// === Persistence Timing ===
export const SETTINGS_DEBOUNCE_MS = 500;
export const CHAT_DEBOUNCE_MS = 1000;
export const APPEND_QUEUE_FLUSH_MS = 100;
export const LOCK_TIMEOUT_MS = 5000;
export const LOCK_STALE_MS = 10000;

// === Gateway Settings ===
export const GATEWAY_URL_DEFAULT = "ws://127.0.0.1:18789";
export const GATEWAY_RECONNECT_BASE_MS = 3_000;
export const GATEWAY_RECONNECT_MAX_MS = 30_000;

// === Chat Window ===
export const CHAT_WINDOW_WIDTH = 300;
export const CHAT_WINDOW_HEIGHT = 280;
export const CHAT_WINDOW_GAP = 4;

// === Chat Behavior ===
export const CHAT_IDLE_FADE_MS = 10_000;
export const CHAT_FADE_TRANSITION_MS = 300;
export const CHAT_MAX_HISTORY = 200;
export const CHAT_DOTS_INTERVAL_MS = 400;
export const CHAT_INPUT_MAX_LENGTH = 4096;

// === UI Animation Timing ===
export const TYPING_ANIMATION_MS = 1400;
export const TYPING_DOT_DELAY_MS = 200;
export const BUTTON_TRANSITION_MS = 150;
export const MESSAGE_APPEAR_MS = 200;

// === UI Sizing ===
export const CONTROL_BUTTON_SIZE = 28;
export const SEND_BUTTON_SIZE = 32;
export const ICON_SIZE = 16;
export const INPUT_MAX_DISPLAY_CHARS = 100; // Show counter after this

// === Animator: Breathing ===
export const BREATHING_FREQ = 1.8;
export const BREATHING_AMP = 0.005;

// === Animator: Head Sway ===
export const HEAD_SWAY_MULTIPLIER_THINKING = 2.5;
export const HEAD_SWAY_MULTIPLIER_SPEAKING = 1.5;
export const HEAD_SWAY_MULTIPLIER_DEFAULT = 1.0;
export const HEAD_SWAY_FREQ_X = 0.5;
export const HEAD_SWAY_FREQ_Y = 0.3;
export const HEAD_SWAY_AMP = 0.01;

// === Animator: Speaking Nod ===
export const SPEAKING_NOD_AMP = 0.015;
export const SPEAKING_NOD_FREQ = 3.0;

// === Animator: Working Tilt ===
export const WORKING_TILT = 0.05;

// === TTS Settings ===
export const TTS_ENABLED_DEFAULT = false;
export const TTS_RATE_DEFAULT = 1.0;
export const TTS_ENGINE_DEFAULT = "web-speech" as const;
export const TTS_VOICE_DEFAULT = "";
