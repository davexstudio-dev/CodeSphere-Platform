// A short, readable name for a session's device (#286), from the User-Agent the server stored:
// « Chrome · Windows ». Only the browser and the system, never the full string; nothing here leaves
// the page. An unknown or empty agent gives null, and the screen says « Appareil inconnu ».

const BROWSERS: [RegExp, string][] = [
	[/Edg(?:e|A|iOS)?\//, "Edge"],
	[/OPR\/|Opera/, "Opera"],
	[/Firefox\/|FxiOS\//, "Firefox"],
	[/Chrome\/|CriOS\//, "Chrome"],
	[/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
	[/Windows/, "Windows"],
	[/Android/, "Android"],
	[/iPhone|iPad|iOS/, "iOS"],
	[/Mac OS X|Macintosh/, "macOS"],
	[/CrOS/, "ChromeOS"],
	[/Linux/, "Linux"],
];

const first = (agent: string, table: [RegExp, string][]) =>
	table.find(([pattern]) => pattern.test(agent))?.[1];

/** « Chrome · Windows », « Safari », « Linux », or null when nothing is recognised. */
export function describeUserAgent(agent: string | null | undefined) {
	if (!agent) {
		return null;
	}
	const parts = [first(agent, BROWSERS), first(agent, SYSTEMS)].filter(Boolean);
	return parts.length > 0 ? parts.join(" · ") : null;
}
