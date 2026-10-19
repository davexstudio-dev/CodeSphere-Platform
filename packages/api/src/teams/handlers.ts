import type { TeamConflict } from "@codesphere/contract/teams";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";

import { requireAdmin } from "../authorization";
import { impl } from "../index";
import { githubFirstCommit } from "./repo-check";
import {
	createTeamService,
	InvalidTeamCursorError,
	type TeamDeps,
	TeamError,
} from "./service";

type Errors = Partial<{
	UNAUTHORIZED: () => Error;
	FORBIDDEN: (options?: { message?: string }) => Error;
	NOT_FOUND: () => Error;
	CONFLICT: (options: {
		message?: string;
		data: { reason?: TeamConflictReason };
	}) => Error;
	BAD_REQUEST: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
}>;

const MESSAGES: Record<string, string> = {
	name: "A Team with this name already exists in this Hackathon.",
	ambiguous:
		"Several Members have this name: share the invitation link instead.",
	version: "The submission changed since you opened it: reload it.",
	github: "Link a GitHub account to submit.",
};

type TeamConflictReason = NonNullable<z.infer<typeof TeamConflict>["reason"]>;

const REASONS = {
	CLOSED: "closed",
	ALREADY_IN_TEAM: "already_in_team",
	TEAM_FULL: "team_full",
} as const;

// Why a refusal is a CONFLICT: its own reason, or the path that named it (name, ambiguous, version).
const reasonOf = (err: TeamError): TeamConflictReason | undefined =>
	err.code in REASONS
		? REASONS[err.code as keyof typeof REASONS]
		: err.path === "name"
			? "name_taken"
			: err.path === "ambiguous" || err.path === "version"
				? err.path
				: undefined;

// The typed refusal of the service.
const refuse = (err: unknown, errors: Errors) => {
	if (err instanceof InvalidTeamCursorError) {
		return (
			errors.BAD_REQUEST?.({
				data: { issues: [{ path: ["cursor"], message: "Invalid cursor" }] },
			}) ?? err
		);
	}
	if (err instanceof TeamError) {
		const message = err.path ? MESSAGES[err.path] : undefined;
		switch (err.code) {
			case "NOT_FOUND":
				return errors.NOT_FOUND?.() ?? err;
			case "FORBIDDEN":
				return errors.FORBIDDEN?.({ message }) ?? err;
			case "CONFLICT":
				return (
					errors.CONFLICT?.({ message, data: { reason: reasonOf(err) } }) ?? err
				);
			case "CLOSED":
			case "ALREADY_IN_TEAM":
			case "TEAM_FULL":
				return errors.CONFLICT?.({ data: { reason: reasonOf(err) } }) ?? err;
			case "BAD_REQUEST":
				return (
					errors.BAD_REQUEST?.({
						data: {
							issues: [
								{ path: [err.path ?? "input"], message: "Invalid value" },
							],
						},
					}) ?? err
				);
		}
	}
	return err;
};

type Sessioned = { session: { user: object } | null };
type Ctx = Sessioned & {
	db: Parameters<typeof createTeamService>[0];
	teamDeps?: TeamDeps;
};

const service = (context: Ctx) =>
	createTeamService(context.db, context.teamDeps);

// Teams belong to human Members: an Agent never joins one.
function humanOf(
	context: Sessioned,
	errors: { UNAUTHORIZED: () => Error; FORBIDDEN: () => Error },
) {
	const user = context.session?.user as
		| { id: string; kind?: string }
		| undefined;
	if (!user) {
		throw errors.UNAUTHORIZED();
	}
	if (user.kind === "agent") {
		throw errors.FORBIDDEN();
	}
	return user.id;
}

export function createTeamsHandlers() {
	const run = async <T>(work: () => Promise<T>, errors: Errors) => {
		try {
			return await work();
		} catch (err) {
			throw refuse(err, errors);
		}
	};
	return {
		mine: impl.teams.mine.handler(({ context, input, errors }) => {
			const userId = humanOf(context, {
				UNAUTHORIZED: errors.UNAUTHORIZED,
				FORBIDDEN: () => errors.UNAUTHORIZED(),
			});
			return run(() => service(context).mine(userId, input.slug), errors);
		}),
		create: impl.teams.create.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).create(
						humanOf(context, errors),
						input.slug,
						input.name,
					),
				errors,
			),
		),
		joinByLink: impl.teams.joinByLink.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).joinByLink(humanOf(context, errors), input.token),
				errors,
			),
		),
		invite: impl.teams.invite.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).invite(
						humanOf(context, errors),
						input.teamId,
						input.name,
					),
				errors,
			),
		),
		invitations: impl.teams.invitations.handler(({ context, errors }) => {
			const userId = humanOf(context, {
				UNAUTHORIZED: errors.UNAUTHORIZED,
				FORBIDDEN: () => errors.UNAUTHORIZED(),
			});
			return run(
				async () => ({ items: await service(context).invitations(userId) }),
				errors,
			);
		}),
		respond: impl.teams.respond.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).respond(
						humanOf(context, errors),
						input.teamId,
						input.accept,
					),
				errors,
			),
		),
		leave: impl.teams.leave.handler(({ context, input, errors }) =>
			run(async () => {
				await service(context).leave(humanOf(context, errors), input.teamId);
				return { success: true };
			}, errors),
		),
		removeMember: impl.teams.removeMember.handler(
			({ context, input, errors }) =>
				run(
					() =>
						service(context).removeMember(
							humanOf(context, errors),
							input.teamId,
							input.memberId,
						),
					errors,
				),
		),
		rotateLink: impl.teams.rotateLink.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).rotateLink(humanOf(context, errors), input.teamId),
				errors,
			),
		),
		disband: impl.teams.disband.handler(({ context, input, errors }) =>
			run(async () => {
				await service(context).disband(humanOf(context, errors), input.teamId);
				return { success: true };
			}, errors),
		),
		saveSubmission: impl.teams.saveSubmission.handler(
			({ context, input, errors }) =>
				run(
					() =>
						service(context).saveSubmission(humanOf(context, errors), input),
					errors,
				),
		),
		gallery: impl.teams.gallery.handler(({ context, input, errors }) =>
			run(() => service(context).gallery(input.slug, input), errors),
		),
	};
}

const isStaff = impl.middleware(async ({ context, next }) => {
	const guard = requireAdmin(context.session);
	if (!guard.ok) {
		throw new ORPCError(guard.code);
	}
	return next();
});

export function createTeamsAdminHandlers() {
	const actor = (context: Sessioned) => {
		if (!context.session) {
			throw new ORPCError("UNAUTHORIZED");
		}
		return (context.session.user as { id: string }).id;
	};
	return {
		checkRepositories: impl.admin.teams.checkRepositories
			.use(isStaff)
			.handler(({ context, input, errors }) =>
				service(context)
					.admin.checkRepositories(
						actor(context),
						input.slug,
						context.teamDeps?.repoCheck ?? githubFirstCommit(),
					)
					.catch((err) => {
						throw refuse(err, errors);
					}),
			),
		flagged: impl.admin.teams.flagged
			.use(isStaff)
			.handler(async ({ context, input, errors }) => {
				try {
					return { items: await service(context).admin.flagged(input.slug) };
				} catch (err) {
					throw refuse(err, errors);
				}
			}),
	};
}
