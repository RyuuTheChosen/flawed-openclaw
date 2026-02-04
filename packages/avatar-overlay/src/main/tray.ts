import { Tray, Menu, app, type BrowserWindow } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { showVrmPicker } from "./window.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;

export function createTray(win: BrowserWindow): Tray {
	const iconPath = path.join(__dirname, "..", "..", "..", "assets", "icon.png");
	tray = new Tray(iconPath);
	tray.setToolTip("OpenClaw Avatar");

	function rebuildMenu(): void {
		const menu = Menu.buildFromTemplate([
			{
				label: win.isVisible() ? "Hide Avatar" : "Show Avatar",
				click() {
					if (win.isVisible()) {
						win.hide();
					} else {
						win.show();
					}
					rebuildMenu();
				},
			},
			{
				label: "Change Avatar Model\u2026",
				click() {
					showVrmPicker(win);
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
		if (win.isVisible()) {
			win.hide();
		} else {
			win.show();
		}
		rebuildMenu();
	});

	return tray;
}
