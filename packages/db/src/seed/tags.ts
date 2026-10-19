// Starting Tags of the platform (spec §2: « liste de départ amorcée (~30, dont `mobile-money`,
// `ussd`, `cadev-2026` »). Normalized: trimmed, lowercase. The team still has to confirm the final
// list (spec, questions ouvertes); adding or removing a name here is the whole change.
export const STARTER_TAGS = [
	// Local context
	"mobile-money",
	"ussd",
	"orange-money",
	"wave",
	"mtn-momo",
	"sms",
	"cadev-2026",
	"hackathon",
	// Reserved: the idea box of the public roadmap (#252) asks its Questions under this Tag.
	"roadmap",
	// Languages
	"javascript",
	"typescript",
	"python",
	"php",
	"java",
	"kotlin",
	"dart",
	"go",
	"sql",
	// Web and mobile
	"react",
	"nextjs",
	"nodejs",
	"flutter",
	"react-native",
	"android",
	"api",
	// Data and infrastructure
	"postgresql",
	"docker",
	"git",
	"linux",
	"cloudflare",
	"deploiement",
	// Practice
	"securite",
	"performance",
	"tests",
	"debutant",
] as const;
