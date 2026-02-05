import * as fs from "node:fs";
import * as path from "node:path";
import {
	WINDOW_POSITION_FILE,
	CAMERA_ZOOM_FILE,
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
} from "../../shared/config.js";
import { getOpenclawDir } from "./file-store.js";
import {
	createDefaultSettings,
	SETTINGS_SCHEMA_VERSION,
	type Settings,
} from "./types.js";
import { loadSettings, getSettingsStore } from "./settings-store.js";

interface LegacyPosition {
	x: number;
	y: number;
}

interface LegacyCamera {
	zoom: number;
}

function readLegacyPosition(): LegacyPosition | null {
	const filePath = path.join(getOpenclawDir(), WINDOW_POSITION_FILE);
	try {
		const data = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(data) as { x?: unknown; y?: unknown };
		if (
			typeof parsed.x === "number" &&
			typeof parsed.y === "number" &&
			Number.isFinite(parsed.x) &&
			Number.isFinite(parsed.y)
		) {
			return { x: parsed.x, y: parsed.y };
		}
	} catch {
		// File doesn't exist or is invalid
	}
	return null;
}

function readLegacyCamera(): LegacyCamera | null {
	const filePath = path.join(getOpenclawDir(), CAMERA_ZOOM_FILE);
	try {
		const data = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(data) as { zoom?: unknown };
		if (
			typeof parsed.zoom === "number" &&
			Number.isFinite(parsed.zoom) &&
			parsed.zoom >= CAMERA_ZOOM_MIN &&
			parsed.zoom <= CAMERA_ZOOM_MAX
		) {
			return { zoom: parsed.zoom };
		}
	} catch {
		// File doesn't exist or is invalid
	}
	return null;
}

function deleteLegacyFile(filename: string): void {
	const filePath = path.join(getOpenclawDir(), filename);
	try {
		fs.unlinkSync(filePath);
		console.log(`[migrations] Deleted legacy file: ${filename}`);
	} catch {
		// File doesn't exist or can't be deleted
	}
}

/**
 * Migrates legacy separate files (position.json, camera.json) to unified settings.
 * Returns the migrated settings if migration occurred, null otherwise.
 * Safe to call multiple times - only migrates if legacy files exist.
 */
export function migrateLegacyFiles(): Settings | null {
	const legacyPosition = readLegacyPosition();
	const legacyCamera = readLegacyCamera();

	// No legacy files to migrate
	if (!legacyPosition && !legacyCamera) {
		return null;
	}

	console.log("[migrations] Found legacy settings files, migrating...");

	// Load current settings (may be defaults if new install)
	const current = loadSettings();

	// Build migrated settings
	const migrated: Settings = {
		...createDefaultSettings(),
		...current,
		schemaVersion: SETTINGS_SCHEMA_VERSION,
	};

	// Only migrate position if not already set in new format
	if (legacyPosition && !current.position) {
		migrated.position = legacyPosition;
		console.log(`[migrations] Migrated position: (${legacyPosition.x}, ${legacyPosition.y})`);
	}

	// Only migrate camera if not already set in new format
	if (legacyCamera && !current.camera) {
		migrated.camera = { zoom: legacyCamera.zoom };
		console.log(`[migrations] Migrated camera zoom: ${legacyCamera.zoom}`);
	}

	// Save migrated settings
	getSettingsStore().save(migrated);

	// Delete legacy files after successful migration
	if (legacyPosition) {
		deleteLegacyFile(WINDOW_POSITION_FILE);
	}
	if (legacyCamera) {
		deleteLegacyFile(CAMERA_ZOOM_FILE);
	}

	console.log("[migrations] Migration complete");
	return migrated;
}
