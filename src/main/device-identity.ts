import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export type DeviceIdentity = {
	deviceId: string;
	publicKeyPem: string;
	privateKeyPem: string;
};

const IDENTITY_DIR = path.join(os.homedir(), ".openclaw", "identity");
const DEVICE_FILE = path.join(IDENTITY_DIR, "device.json");
const DEVICE_AUTH_FILE = path.join(IDENTITY_DIR, "device-auth.json");

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function base64UrlEncode(buf: Buffer): string {
	return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
	const spki = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
	if (
		spki.length === ED25519_SPKI_PREFIX.length + 32 &&
		spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
	) {
		return spki.subarray(ED25519_SPKI_PREFIX.length);
	}
	return spki;
}

export function loadDeviceIdentity(): DeviceIdentity | null {
	try {
		if (!fs.existsSync(DEVICE_FILE)) return null;
		const raw = fs.readFileSync(DEVICE_FILE, "utf8");
		const parsed = JSON.parse(raw);
		if (
			parsed?.version === 1 &&
			typeof parsed.deviceId === "string" &&
			typeof parsed.publicKeyPem === "string" &&
			typeof parsed.privateKeyPem === "string"
		) {
			return {
				deviceId: parsed.deviceId,
				publicKeyPem: parsed.publicKeyPem,
				privateKeyPem: parsed.privateKeyPem,
			};
		}
	} catch {
		// Corrupt or unreadable
	}
	return null;
}

export function loadStoredAuthToken(deviceId: string, role: string): string | null {
	try {
		if (!fs.existsSync(DEVICE_AUTH_FILE)) return null;
		const raw = fs.readFileSync(DEVICE_AUTH_FILE, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed?.version !== 1 || parsed.deviceId !== deviceId) return null;
		if (!parsed.tokens || typeof parsed.tokens !== "object") return null;
		const entry = parsed.tokens[role.trim()];
		if (!entry || typeof entry.token !== "string") return null;
		return entry.token;
	} catch {
		return null;
	}
}

export function signPayload(privateKeyPem: string, payload: string): string {
	const key = crypto.createPrivateKey(privateKeyPem);
	return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), key) as Buffer);
}

export function publicKeyToBase64Url(publicKeyPem: string): string {
	return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

export function buildAuthPayload(params: {
	deviceId: string;
	clientId: string;
	clientMode: string;
	role: string;
	scopes: string[];
	signedAtMs: number;
	token: string | null;
	nonce: string | undefined;
}): string {
	const version = params.nonce ? "v2" : "v1";
	const base = [
		version,
		params.deviceId,
		params.clientId,
		params.clientMode,
		params.role,
		params.scopes.join(","),
		String(params.signedAtMs),
		params.token ?? "",
	];
	if (version === "v2") base.push(params.nonce ?? "");
	return base.join("|");
}
