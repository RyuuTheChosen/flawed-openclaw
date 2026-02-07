import { Tray, Menu, app } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { showVrmPicker } from "./window.js";
import type { WindowManager } from "./window-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;

export function createTray(wm: WindowManager): Tray {
	const iconPath = path.join(__dirname, "..", "..", "..", "assets", "icon.png");
	tray = new Tray(iconPath);
	tray.setToolTip("Flawed Avatar");

	function rebuildMenu(): void {
		const menu = Menu.buildFromTemplate([
			{
				label: wm.avatarWin.isVisible() ? "Hide Avatar" : "Show Avatar",
				click() {
					if (wm.avatarWin.isVisible()) {
						wm.hideAll();
					} else {
						wm.showAvatar();
					}
					rebuildMenu();
				},
			},
			{
				label: "Change Avatar Model\u2026",
				click() {
					showVrmPicker(wm.avatarWin);
				},
			},
			{
				label: "Settings\u2026",
				click() {
					wm.showSettings();
				},
			},
			{ type: "separator" },
			{
				label: "Quit",
				click() {
					app.quit();
				},
			},
		]);
		tray!.setContextMenu(menu);
	}

	rebuildMenu();

	tray.on("click", () => {
		if (wm.avatarWin.isVisible()) {
			wm.hideAll();
		} else {
			wm.showAvatar();
		}
		rebuildMenu();
	});

	return tray;
}
