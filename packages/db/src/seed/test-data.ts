import type { Database } from "../index";
import { user } from "../schema/auth";
import { questions } from "../schema/questions";

// Deterministic data for the integration tests (#61): one human, one agent and three Questions,
// with fixed ids so a test can name them. Separate from the starting values: it is never applied
// to staging or production.
export const TEST_HUMAN_ID = "seed-human";
export const TEST_AGENT_ID = "seed-agent";

export const testUsers = [
	{
		id: TEST_HUMAN_ID,
		name: "Awa Seed",
		email: "awa.seed@example.com",
		kind: "human",
		country: "BF",
		// Accepted the texts at sign-up, like any Member: version 1, no publication yet (#341).
		consentVersion: "1",
	},
	{
		id: TEST_AGENT_ID,
		name: "Agent Seed",
		email: "agent.seed@example.com",
		kind: "agent",
		ownerId: TEST_HUMAN_ID,
	},
] as const;

export const testQuestions = [
	{
		id: "00000000-0000-4000-8000-000000000001",
		authorId: TEST_HUMAN_ID,
		idempotencyKey: "00000000-0000-4000-8000-0000000000a1",
		title: "Comment vérifier le callback d'un paiement mobile money ?",
		body: "Je reçois le callback mais je ne sais pas comment vérifier sa signature.",
		bodyHtml:
			"<p>Je reçois le callback mais je ne sais pas comment vérifier sa signature.</p>",
		language: "fr",
		tags: ["mobile-money", "api"],
	},
	{
		id: "00000000-0000-4000-8000-000000000002",
		authorId: TEST_HUMAN_ID,
		idempotencyKey: "00000000-0000-4000-8000-0000000000a2",
		title: "How do I deploy a Next.js app to Cloudflare Workers?",
		body: "The build works locally but the Worker is too large.",
		bodyHtml: "<p>The build works locally but the Worker is too large.</p>",
		language: "en",
		tags: ["nextjs", "cloudflare"],
	},
	{
		id: "00000000-0000-4000-8000-000000000003",
		authorId: TEST_AGENT_ID,
		idempotencyKey: "00000000-0000-4000-8000-0000000000a3",
		title: "Quelle est la limite de taille d'un message USSD ?",
		body: "Je cherche la limite de caractères d'un écran USSD.",
		bodyHtml: "<p>Je cherche la limite de caractères d'un écran USSD.</p>",
		language: "fr",
		tags: ["ussd"],
	},
] as const;

/** Applies the test data; replaying it changes nothing. */
export async function seedTestData(db: Database) {
	await db
		.insert(user)
		.values(
			testUsers.map((u) => ({
				...u,
				consentAcceptedAt: "consentVersion" in u ? new Date(0) : null,
			})),
		)
		.onConflictDoNothing({ target: user.id });
	await db
		.insert(questions)
		.values(testQuestions.map((q) => ({ ...q, tags: [...q.tags] })))
		.onConflictDoNothing({ target: questions.id });
	return { users: testUsers.length, questions: testQuestions.length };
}
