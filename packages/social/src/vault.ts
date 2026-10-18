/**
 * Encryption at rest of the official accounts' tokens (#266, ADR 0001).
 *
 * AES-256-GCM, the key derived with HKDF-SHA-256 from a server secret that is NOT the auth secret:
 * rotating one must not lock the other. Each value gets a fresh random IV, and is bound to a
 * `context` (the platform it belongs to) as authenticated data, so a ciphertext copied onto
 * another row, or altered, fails to open. Web Crypto only: it runs on Bun and on Workers alike.
 *
 * Wire format: `v1.<iv>.<ciphertext>` (base64url). The version prefix leaves room for a key rotation.
 */

const VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const SALT = "codesphere/social-credentials";
const INFO = "aes-256-gcm/v1";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
	const padded = text.replace(/-/g, "+").replace(/_/g, "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/** A sealed value could not be opened: wrong secret, wrong row, or altered data. Carries no detail. */
export class VaultError extends Error {
	constructor() {
		super("The stored credential cannot be decrypted");
		this.name = "VaultError";
	}
}

export interface Vault {
	seal(plaintext: string, context: string): Promise<string>;
	open(sealed: string, context: string): Promise<string>;
}

/** The vault for `secret` (at least 32 characters). The key is derived on first use. */
export function createVault(secret: string): Vault {
	if (secret.length < MIN_SECRET_LENGTH) {
		throw new Error(
			`The social credentials secret must be at least ${MIN_SECRET_LENGTH} characters`,
		);
	}
	let key: Promise<CryptoKey> | undefined;
	const derive = () => {
		key ??= crypto.subtle
			.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"])
			.then((material) =>
				crypto.subtle.deriveKey(
					{
						name: "HKDF",
						hash: "SHA-256",
						salt: encoder.encode(SALT),
						info: encoder.encode(INFO),
					},
					material,
					{ name: "AES-GCM", length: 256 },
					false,
					["encrypt", "decrypt"],
				),
			);
		return key;
	};

	return {
		async seal(plaintext, context) {
			const iv = crypto.getRandomValues(new Uint8Array(12));
			const sealed = await crypto.subtle.encrypt(
				{ name: "AES-GCM", iv, additionalData: encoder.encode(context) },
				await derive(),
				encoder.encode(plaintext),
			);
			return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
		},
		async open(sealed, context) {
			const [version, iv, data, extra] = sealed.split(".");
			if (version !== VERSION || !iv || !data || extra !== undefined) {
				throw new VaultError();
			}
			try {
				const plain = await crypto.subtle.decrypt(
					{
						name: "AES-GCM",
						iv: fromBase64Url(iv),
						additionalData: encoder.encode(context),
					},
					await derive(),
					fromBase64Url(data),
				);
				return decoder.decode(plain);
			} catch {
				throw new VaultError();
			}
		},
	};
}
