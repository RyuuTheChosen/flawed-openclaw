import { Tray, Menu, dialog, app, type BrowserWindow } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { IPC } from "../shared/ipc-channels.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray: Tray | null = null;

export function createTray(win: BrowserWindow): Tray {
	const iconPath = path.join(__dirname, "..", "..", "..", "assets", "icon.png");
	tray = new Tray(iconPath);
	tray.setToolTip("OpenClaw Avatar");

	let visible = true;

	function rebuildMenu(): void {
		const menu = Menu.buildFromTemplate([
			{
				label: visible ? "Hide Avatar" : "Show Avatar",
				click() {
					if (visible) {
						win.hide();
					} else {
						win.show();
					}
					visible = !visible;
					rebuildMenu();
				},
			},
			{
				label: "Change Avatar Model…",
				async click() {
					const result = await dialog.showOpenDialog(win, {
						title: "Select VRM Model",
						filters: [{ name: "VRM Models", extensions: ["vrm"] }],
						properties: ["openFile"],
					});
					if (!result.canceled && result.filePaths.length > 0) {
						win.webContents.send(IPC.VRM_MODEL_CHANGED, result.filePaths[0]);
					}
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
		if (visible) {
			win.hide();
		} else {
			win.show();
		}
		visible = !visible;
		rebuildMenu();
	});

	return tray;
}
