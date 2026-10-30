/// <reference types="bun" />
// #323: the banner's calendar and countdown, read from a server render with a frozen clock.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CadevBanner } from "./cadev-banner";

const milestones = [
	{ key: "close", label: "Clôture", startsAt: "2026-11-15T17:00:00Z" },
	{ key: "public", label: "Vote du public", startsAt: "2026-11-17T17:00:00Z" },
];
const props = {
	name: "CADEV",
	summary: "Concours en ligne",
	closesAt: "2026-11-15T17:00:00Z",
	milestones,
	locale: "fr",
	now: new Date("2026-10-30T12:00:00Z"),
};

describe("CadevBanner", () => {
	test("the card marks the next Milestone as the current step", () => {
		const html = renderToStaticMarkup(<CadevBanner {...props} />);
		expect(html.match(/aria-current="step"/g)).toHaveLength(1);
		expect(html.indexOf('aria-current="step"')).toBeLessThan(
			html.indexOf("Clôture"),
		);
	});

	test("the card marks no step once every Milestone has passed", () => {
		const html = renderToStaticMarkup(
			<CadevBanner {...props} now={new Date("2026-12-01T12:00:00Z")} />,
		);
		expect(html).not.toContain('aria-current="step"');
	});

	test("the rail is compact: the countdown without the calendar", () => {
		const html = renderToStaticMarkup(
			<CadevBanner {...props} variant="rail" />,
		);
		expect(html).toContain("16 j 05 h");
		expect(html).not.toContain("<ol");
	});
});
