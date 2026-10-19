import { user } from "@codesphere/db/schema/auth";
import { eq } from "drizzle-orm";

import { createAnswerService } from "../answers/service";
import type { Context } from "../context";
import { impl } from "../index";
import { AgentError, createAgentService } from "./service";

// Managing Agents is for human Owners: a visitor is UNAUTHORIZED and an Agent FORBIDDEN.
// Tells the Owner a key now exists, never the key. A failed send is logged by the mailer and never
// fails the request: the key was already issued.
async function notifyKeyCreated(
	context: Context,
	ownerId: string,
	keyName: string,
) {
	if (!context.notifications) {
		return;
	}
	try {
		const [owner] = await context.db
			.select({ email: user.email, name: user.name })
			.from(user)
			.where(eq(user.id, ownerId))
			.limit(1);
		if (owner) {
			await context.notifications.apiKeyCreated(owner, keyName);
		}
	} catch (error) {
		context.logger.warn({ err: error }, "key notification failed");
	}
}

export function createAgentsHandlers() {
	const owner = (
		context: { session: { user: { id: string } } | null },
		errors: { UNAUTHORIZED: () => Error; FORBIDDEN: () => Error },
	) => {
		const user = context.session?.user as
			| { id: string; kind?: string }
			| undefined;
		if (!user) {
			throw errors.UNAUTHORIZED();
		}
		if (user.kind !== "human") {
			throw errors.FORBIDDEN();
		}
		return user.id;
	};
	const refusal = (
		err: unknown,
		errors: {
			NOT_FOUND: () => Error;
			CONFLICT?: () => Error;
			FORBIDDEN?: (options?: { message?: string }) => Error;
			AGENT_CREATION_BLOCKED?: (options: { data: { until: string } }) => Error;
		},
	) => {
		if (err instanceof AgentError) {
			if (err.code === "CONFLICT" && errors.CONFLICT) return errors.CONFLICT();
			if (err.code === "PAUSED" && errors.FORBIDDEN) {
				return errors.FORBIDDEN({
					message:
						"This Agent was paused again: only an Admin can bring it back.",
				});
			}
			if (
				err.code === "BLOCKED" &&
				err.until &&
				errors.AGENT_CREATION_BLOCKED
			) {
				return errors.AGENT_CREATION_BLOCKED({
					data: { until: err.until.toISOString() },
				});
			}
			return errors.NOT_FOUND();
		}
		return err;
	};

	return {
		list: impl.agents.list.handler(async ({ context, errors }) =>
			createAgentService(context.db, context.agentRules).list(
				owner(context, errors),
			),
		),
		create: impl.agents.create.handler(async ({ context, input, errors }) => {
			const ownerId = owner(context, errors);
			try {
				const created = await createAgentService(
					context.db,
					context.agentRules,
				).create(ownerId, input);
				await notifyKeyCreated(context, ownerId, created.agent.name);
				return created;
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
		rotateKey: impl.agents.rotateKey.handler(
			async ({ context, input, errors }) => {
				const ownerId = owner(context, errors);
				try {
					const rotated = await createAgentService(
						context.db,
						context.agentRules,
					).rotateKey(ownerId, input.id);
					await notifyKeyCreated(context, ownerId, rotated.agent.name);
					return rotated;
				} catch (err) {
					throw refusal(err, errors);
				}
			},
		),
		disable: impl.agents.disable.handler(async ({ context, input, errors }) => {
			const ownerId = owner(context, errors);
			try {
				return await createAgentService(context.db, context.agentRules).disable(
					ownerId,
					input.id,
				);
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
		profile: impl.agents.profile.handler(async ({ context, input, errors }) => {
			try {
				const info = await createAgentService(
					context.db,
					context.agentRules,
				).publicInfo(input.id);
				const stats = await createAnswerService(context.db).agentStats(
					input.id,
					info.rejectScore,
				);
				const rate = (n: number) => (stats.total === 0 ? 0 : n / stats.total);
				return {
					id: info.id,
					name: info.name,
					ownerName: info.ownerName,
					status: info.status,
					createdAt: info.createdAt,
					answers: {
						total: stats.total,
						validated: stats.validated,
						rejected: stats.rejected,
						validationRate: rate(stats.validated),
						rejectionRate: rate(stats.rejected),
					},
					recent: stats.recent,
				};
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
		delete: impl.agents.delete.handler(async ({ context, input, errors }) => {
			const ownerId = owner(context, errors);
			try {
				return await createAgentService(context.db, context.agentRules).remove(
					ownerId,
					input.id,
				);
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
	};
}
