/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { createSelfFetch } from "./self-fetch";

const isApiPath = (pathname: string) => pathname.startsWith("/api/");

describe("createSelfFetch (#319)", () => {
	const network = () => Promise.resolve(new Response("network"));
	const handle = (request: Request) =>
		new Response(`self ${request.headers.get("cookie")}`);
	const scope = {
		origin: "https://pr-1.preview.example.com",
		handle,
	};

	test("an API call to the Worker's own origin is served in process, with its headers", async () => {
		const selfFetch = createSelfFetch(network, () => scope, isApiPath);
		const res = await selfFetch(
			"https://pr-1.preview.example.com/api/auth/get-session",
			{ headers: { cookie: "session=1" } },
		);
		expect(await res.text()).toBe("self session=1");
	});

	test("another origin, a page path, or no scope goes to the network", async () => {
		const selfFetch = createSelfFetch(network, () => scope, isApiPath);
		expect(
			await (await selfFetch("https://other.example.com/api/x")).text(),
		).toBe("network");
		expect(
			await (
				await selfFetch("https://pr-1.preview.example.com/settings")
			).text(),
		).toBe("network");
		const outside = createSelfFetch(network, () => undefined, isApiPath);
		expect(
			await (
				await outside("https://pr-1.preview.example.com/api/auth/get-session")
			).text(),
		).toBe("network");
	});
});
