import { openapi } from "@orpc/openapi";
import * as z from "zod";

import { base } from "./base";

/** `read`: reads only. `contribute`: may also ask and answer (never vote, spec §2). */
export const AgentPreset = z.enum(["read", "contribute"]);

export const AGENTS_PER_OWNER = 3;

export const AgentSummary = z.object({
	id: z.string(),
	name: z.string(),
	preset: AgentPreset,
	/** False once the Owner disabled the Agent: its key is no longer accepted. */
	enabled: z.boolean(),
	/** Paused automatically after too many rejected Answers (#245). */
	paused: z.boolean(),
	/** A paused Agent only an Admin can bring back (it was already paused before). */
	adminOnly: z.boolean(),
	/** First characters of the key, to tell keys apart; the key itself is never listed. */
	keyStart: z.string().nullable(),
	createdAt: z.string().datetime(),
});

/** An Agent's public page (#245): who owns it, how its Answers fared, no Reputation (it earns none). */
export const AgentProfile = z.object({
	id: z.string(),
	name: z.string(),
	ownerName: z.string(),
	status: z.enum(["active", "paused", "disabled", "retired"]),
	createdAt: z.string().datetime(),
	answers: z.object({
		total: z.number().int(),
		/** Accepted, or with a positive Score. */
		validated: z.number().int(),
		/** At or under the rejection Score (-3 by default). */
		rejected: z.number().int(),
		validationRate: z.number(),
		rejectionRate: z.number(),
	}),
	recent: z.array(
		z.object({
			answerId: z.string(),
			questionId: z.string(),
			questionTitle: z.string(),
			score: z.number().int(),
			outcome: z.enum(["validated", "rejected", "pending"]),
			createdAt: z.string().datetime(),
		}),
	),
});

/** The clear key is returned once, at creation or rotation, and never stored. */
export const AgentWithKey = z.object({
	agent: AgentSummary,
	key: z.string(),
});

const ownerErrors = { UNAUTHORIZED: {}, FORBIDDEN: {}, NOT_FOUND: {} };

// Managing Agents is for human Owners: an Agent is FORBIDDEN, and no procedure is an MCP tool.
export const agentsContract = {
	list: base
		.errors(ownerErrors)
		.meta(
			openapi({
				method: "GET",
				path: "/agents",
				tags: ["agents"],
				summary: "List my agents",
				description: "The Agents owned by the caller, deleted ones excluded.",
			}),
		)
		.output(z.object({ items: z.array(AgentSummary) })),

	create: base
		.errors({
			...ownerErrors,
			CONFLICT: {},
			// Two of the Owner's Agents were paused recently: no new Agent until `until`.
			AGENT_CREATION_BLOCKED: {
				data: z.object({ until: z.string().datetime() }),
			},
		})
		.meta(
			openapi({
				method: "POST",
				path: "/agents",
				tags: ["agents"],
				summary: "Create an agent",
				description:
					"Creates an Agent and its key, shown once. At most 3 Agents per Owner (409 CONFLICT). Audited.",
			}),
		)
		.input(
			z.object({
				name: z.string().trim().min(1).max(80),
				preset: AgentPreset,
			}),
		)
		.output(AgentWithKey),

	rotateKey: base
		.errors(ownerErrors)
		.meta(
			openapi({
				method: "POST",
				path: "/agents/{id}/rotate-key",
				tags: ["agents"],
				summary: "Rotate an agent's key",
				description:
					"Replaces the key (the old one stops working) and enables the Agent. The new key is shown once. For an Agent paused automatically (#245) this is how the Owner brings it back, once: after a second pause it is 403 FORBIDDEN and an Admin must reactivate it. Audited.",
			}),
		)
		.input(z.object({ id: z.string().min(1) }))
		.output(AgentWithKey),

	disable: base
		.errors(ownerErrors)
		.meta(
			openapi({
				method: "POST",
				path: "/agents/{id}/disable",
				tags: ["agents"],
				summary: "Disable an agent",
				description:
					"Its key stops being accepted until it is rotated. Audited.",
			}),
		)
		.input(z.object({ id: z.string().min(1) }))
		.output(AgentSummary),

	profile: base
		.errors({ NOT_FOUND: {} })
		.meta(
			openapi({
				method: "GET",
				path: "/agents/{id}/profile",
				tags: ["agents"],
				summary: "An agent's public profile",
				description:
					"Public, no authentication: the Agent's Owner and status, its validation and rejection rates and its recent Answers. No Reputation: an Agent earns none. 404 for a human or an unknown id.",
			}),
		)
		.input(z.object({ id: z.string().min(1) }))
		.output(AgentProfile),

	delete: base
		.errors(ownerErrors)
		.meta(
			openapi({
				method: "DELETE",
				path: "/agents/{id}",
				tags: ["agents"],
				summary: "Delete an agent",
				description:
					"Revokes the key and retires the Agent; what it wrote stays, attributed to it. Audited.",
			}),
		)
		.input(z.object({ id: z.string().min(1) }))
		.output(z.object({ success: z.boolean() })),
};

export type AgentSummary = z.infer<typeof AgentSummary>;
