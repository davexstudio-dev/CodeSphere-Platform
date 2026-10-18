/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { createVault, VaultError } from "./vault";

const SECRET = "a-server-secret-of-at-least-32-characters!";

describe("vault", () => {
	test("opens what it sealed", async () => {
		const vault = createVault(SECRET);
		const sealed = await vault.seal("the refresh token", "x");
		expect(await vault.open(sealed, "x")).toBe("the refresh token");
	});

	test("the sealed value carries no trace of the plaintext", async () => {
		const sealed = await createVault(SECRET).seal("rt-very-secret-value", "x");
		expect(sealed).not.toContain("rt-very-secret-value");
		expect(sealed.startsWith("v1.")).toBe(true);
	});

	test("the same plaintext seals differently every time (fresh IV)", async () => {
		const vault = createVault(SECRET);
		expect(await vault.seal("same", "x")).not.toBe(
			await vault.seal("same", "x"),
		);
	});

	test("another secret cannot open it", async () => {
		const sealed = await createVault(SECRET).seal("t", "x");
		await expect(
			createVault(`${SECRET}-other`).open(sealed, "x"),
		).rejects.toBeInstanceOf(VaultError);
	});

	test("a value copied onto another row (another context) does not open", async () => {
		const vault = createVault(SECRET);
		const sealed = await vault.seal("t", "x");
		await expect(vault.open(sealed, "linkedin")).rejects.toBeInstanceOf(
			VaultError,
		);
	});

	test("an altered value does not open", async () => {
		const vault = createVault(SECRET);
		const sealed = await vault.seal("t", "x");
		const [v, iv, data] = sealed.split(".");
		const flipped = `${data?.slice(0, -2)}${data?.endsWith("AA") ? "BB" : "AA"}`;
		await expect(
			vault.open(`${v}.${iv}.${flipped}`, "x"),
		).rejects.toBeInstanceOf(VaultError);
		await expect(vault.open("v2.a.b", "x")).rejects.toBeInstanceOf(VaultError);
		await expect(vault.open("garbage", "x")).rejects.toBeInstanceOf(VaultError);
	});

	test("the error says nothing about why", async () => {
		const error = await createVault(SECRET)
			.open("v1.AAAA.BBBB", "x")
			.catch((e: Error) => e);
		expect((error as Error).message).toBe(
			"The stored credential cannot be decrypted",
		);
	});

	test("a short secret is refused", () => {
		expect(() => createVault("too-short")).toThrow();
	});
});
