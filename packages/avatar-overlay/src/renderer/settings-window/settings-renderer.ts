import { createSettingsPanel } from "./settings-panel.js";

const bridge = window.settingsBridge;
const root = document.getElementById("settings-root")!;
createSettingsPanel(root, bridge);
