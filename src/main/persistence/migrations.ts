import * as fs from "node:fs";
import * as path from "node:path";
import {
	WINDOW_POSITION_FILE,
	CAMERA_ZOOM_FILE,
	CAMERA_ZOOM_MIN,
	CAMERA_ZOOM_MAX,
	SCALE_DEFAULT,
	LIGHTING_PROFILE_DEFAULT,
} from "../../shared/config.js";
import { getOpenclawDir } from "./file-store.js";
import {
	createDefaultSettings,
	SETTINGS_SCHEMA_VERSION,
	type Settings,
} from "./types.js";
import { loadSettings, getSettingsStore } from "./settings-store.js";
import { computeDisplayHash } from "../display-utils.js";

/**
 * Renames old avatar-overlay-*.json files to flawed-avatar-*.json
 * so existing users' settings survive the package rename.
 */
export function migrateFileNames(): void {
	const dir = getOpenclawDir();
	const renames: [string, string][] = [
		["avatar-overlay-settings.json", "flawed-avatar-settings.json"],
		["avatar-overlay-position.json", "flawed-avatar-position.json"],
		["avatar-overlay-camera.json", "flawed-avatar-camera.json"],
		["avatar-overlay-chat.json", "flawed-avatar-chat.json"],
	];

	for (const [oldName, newName] of renames) {
		const oldPath = path.join(dir, oldName);
		const newPath = path.join(dir, newName);
		try {
			if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
				fs.renameSync(oldPath, newPath);
				console.log(`[migrations] Renamed ${oldName} → ${newName}`);
			}
		} catch {
			// Best-effort; next run will retry
		}
	}
}

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
	if (legacyPosition && (!current.position || Object.keys(current.position).length === 0)) {
		const hash = computeDisplayHash();
		migrated.position = { [hash]: legacyPosition };
		console.log(`[migrations] Migrated position: (${legacyPosition.x}, ${legacyPosition.y}) for display ${hash}`);
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

/**
 * Migrates settings from schema v1 to v2.
 * Converts position from `{x,y}` flat object to `Record<displayHash, {x,y}>`.
 * Reads raw JSON to avoid schema validation rejecting the old format.
 */
export function migrateV1ToV2(): void {
	const filePath = path.join(getOpenclawDir(), "flawed-avatar-settings.json");
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return; // No settings file yet
	}

	// Already at v2 or newer
	if (typeof raw.schemaVersion === "number" && raw.schemaVersion >= 2) return;

	// Check if position is old v1 format ({x, y} directly)
	const pos = raw.position;
	if (
		pos &&
		typeof pos === "object" &&
		!Array.isArray(pos) &&
		"x" in (pos as Record<string, unknown>) &&
		"y" in (pos as Record<string, unknown>)
	) {
		const oldPos = pos as { x: number; y: number };
		const hash = computeDisplayHash();
		console.log(`[migrations] Converting v1 position to v2 keyed by display hash ${hash}`);
		raw.position = { [hash]: { x: oldPos.x, y: oldPos.y } };
	}

	raw.schemaVersion = 2;

	try {
		fs.writeFileSync(filePath, JSON.stringify(raw, null, "\t"));
		console.log("[migrations] Schema upgraded to v2");
	} catch (err) {
		console.warn("[migrations] Failed to write v2 migration:", err);
	}
}

/**
 * Migrates settings from schema v2 to v3.
 * Adds `scale` and `lightingProfile` fields with defaults.
 */
export function migrateV2ToV3(): void {
	const filePath = path.join(getOpenclawDir(), "flawed-avatar-settings.json");
	let raw: Record<string, unknown>;
	try {
		raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
	} catch {
		return; // No settings file yet
	}

	// Already at v3 or newer
	if (typeof raw.schemaVersion === "number" && raw.schemaVersion >= 3) return;

	// Add defaults for new fields
	if (raw.scale === undefined) {
		raw.scale = SCALE_DEFAULT;
	}
	if (raw.lightingProfile === undefined) {
		raw.lightingProfile = LIGHTING_PROFILE_DEFAULT;
	}

	raw.schemaVersion = SETTINGS_SCHEMA_VERSION;

	try {
		fs.writeFileSync(filePath, JSON.stringify(raw, null, "\t"));
		console.log("[migrations] Schema upgraded to v3");
	} catch (err) {
		console.warn("[migrations] Failed to write v3 migration:", err);
	}
}
