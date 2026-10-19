// `bun run db:seed:demo [-- --reset] [--owner-email <email>]`: loads the CADEV demo content (#57)
// into the database of DATABASE_URL. Idempotent. Meant for staging or the demo database, never a
// deploy step. With --reset, removes the demo content already there first (needed after the content
// changed). With --owner-email, also creates the demo Agent for that Member and prints its key once.
import { createDb } from "@codesphere/db";

import { AnswerError } from "../answers/service";
import { DemoSeedError, resetDemo, seedDemo } from "./seed";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set.");
	process.exit(1);
}

const at = process.argv.indexOf("--owner-email");
const ownerEmail = at === -1 ? undefined : process.argv[at + 1];
if (at !== -1 && !ownerEmail) {
	console.error(
		"Usage: bun run db:seed:demo -- [--reset] [--owner-email <email>]",
	);
	process.exit(1);
}

const db = createDb({ DATABASE_URL: url });
try {
	if (process.argv.includes("--reset")) {
		console.info("demo reset:", await resetDemo(db));
	}
	const { agent, ...counts } = await seedDemo(db, { ownerEmail });
	console.info("demo seed:", counts);
	if (agent?.created) {
		console.info(
			`demo agent created (${agent.id}). Its key, shown only now, for the MCP client:\n${agent.key}`,
		);
	} else if (agent) {
		console.info(
			`demo agent already there (${agent.id}): its key is not shown again, rotate it from Settings → Agents if needed.`,
		);
	}
} catch (err) {
	if (err instanceof DemoSeedError) {
		console.error(err.message);
		process.exitCode = 1;
	} else if (err instanceof AnswerError && err.code === "CONFLICT") {
		// A demo Member already answered that Question under another key: an older demo content.
		console.error(
			"The database holds an older version of the demo content. Run again with --reset.",
		);
		process.exitCode = 1;
	} else {
		throw err;
	}
} finally {
	await db.$client.end();
}
