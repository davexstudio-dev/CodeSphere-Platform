// `bun run db:seed:demo [-- --owner-email <email>]`: loads the CADEV demo content (#57) into the
// database of DATABASE_URL. Idempotent. Meant for staging or the demo database, never a deploy step.
// With --owner-email, also creates the demo Agent for that Member and prints its key once.
import { createDb } from "@codesphere/db";

import { DemoSeedError, seedDemo } from "./seed";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL is not set.");
	process.exit(1);
}

const at = process.argv.indexOf("--owner-email");
const ownerEmail = at === -1 ? undefined : process.argv[at + 1];
if (at !== -1 && !ownerEmail) {
	console.error("Usage: bun run db:seed:demo -- --owner-email <email>");
	process.exit(1);
}

const db = createDb({ DATABASE_URL: url });
try {
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
	} else {
		throw err;
	}
} finally {
	await db.$client.end();
}
