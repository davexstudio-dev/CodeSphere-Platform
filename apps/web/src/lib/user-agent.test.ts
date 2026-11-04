/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { describeUserAgent } from "./user-agent";

describe("describeUserAgent", () => {
	test("names the browser and the system", () => {
		expect(
			describeUserAgent(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",
			),
		).toBe("Chrome · Windows");
		expect(
			describeUserAgent(
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
			),
		).toBe("Safari · macOS");
		expect(
			describeUserAgent(
				"Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
			),
		).toBe("Firefox · Linux");
	});

	test("Edge and Opera are not taken for Chrome", () => {
		expect(
			describeUserAgent(
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0",
			),
		).toBe("Edge · Windows");
	});

	test("a phone reads as the phone's system, not as Linux or macOS", () => {
		expect(
			describeUserAgent(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
			),
		).toBe("Safari · iOS");
		expect(
			describeUserAgent(
				"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/156.0.0.0 Mobile Safari/537.36",
			),
		).toBe("Chrome · Android");
	});

	test("an empty or unknown agent gives null", () => {
		expect(describeUserAgent("")).toBeNull();
		expect(describeUserAgent(null)).toBeNull();
		expect(describeUserAgent("curl/8.0")).toBeNull();
	});
});
