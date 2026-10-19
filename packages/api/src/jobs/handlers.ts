import { ORPCError } from "@orpc/server";

import { requireAdmin } from "../authorization";
import { impl } from "../index";
import { createJobService, InvalidJobCursorError, JobError } from "./service";

type Errors = {
	UNAUTHORIZED?: () => Error;
	FORBIDDEN?: () => Error;
	NOT_FOUND?: () => Error;
	CONFLICT?: (options?: { message?: string }) => Error;
	BAD_REQUEST?: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
};

// The typed refusal of the service.
const refuse = (err: unknown, errors: Errors) => {
	if (err instanceof InvalidJobCursorError) {
		return (
			errors.BAD_REQUEST?.({
				data: { issues: [{ path: ["cursor"], message: "Invalid cursor" }] },
			}) ?? err
		);
	}
	if (err instanceof JobError) {
		switch (err.code) {
			case "NOT_FOUND":
				return errors.NOT_FOUND?.() ?? err;
			case "FORBIDDEN":
				return errors.FORBIDDEN?.() ?? err;
			case "CONFLICT":
				return (
					errors.CONFLICT?.({
						message:
							err.path === "limit"
								? "Too many live postings for this Organization."
								: undefined,
					}) ?? err
				);
			case "BAD_REQUEST":
				return (
					errors.BAD_REQUEST?.({
						data: {
							issues: [
								{
									path: [err.path ?? "input"],
									message: err.reason ?? "Invalid value",
								},
							],
						},
					}) ?? err
				);
		}
	}
	return err;
};

type Sessioned = { session: { user: object } | null };
type Ctx = Sessioned & { db: Parameters<typeof createJobService>[0] };

const service = (context: Ctx) => createJobService(context.db);
const viewerOf = (context: Sessioned) =>
	context.session ? { id: (context.session.user as { id: string }).id } : null;

// Publishing, applying and reporting belong to human Members: an Agent never acts for a candidate
// or an Organization.
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

export function createJobsHandlers() {
	const run = async <T>(work: () => Promise<T>, errors: Errors) => {
		try {
			return await work();
		} catch (err) {
			throw refuse(err, errors);
		}
	};
	return {
		list: impl.jobs.list.handler(({ context, input, errors }) =>
			run(() => service(context).list(input, viewerOf(context)), errors),
		),
		get: impl.jobs.get.handler(({ context, input, errors }) =>
			run(() => service(context).get(input.id, viewerOf(context)), errors),
		),
		matching: impl.jobs.matching.handler(({ context, input, errors }) => {
			const viewer = viewerOf(context);
			if (!viewer) {
				throw errors.UNAUTHORIZED();
			}
			return run(
				async () => ({
					items: await service(context).matching(viewer.id, input.limit),
				}),
				errors,
			);
		}),
		publish: impl.jobs.publish.handler(({ context, input, errors }) =>
			run(
				() => service(context).publish(humanOf(context, errors), input),
				errors,
			),
		),
		close: impl.jobs.close.handler(({ context, input, errors }) =>
			run(async () => {
				await service(context).close(humanOf(context, errors), input.id);
				return { success: true };
			}, errors),
		),
		applyTo: impl.jobs.applyTo.handler(({ context, input, errors }) =>
			run(
				() =>
					service(context).applyTo(
						humanOf(context, errors),
						input.id,
						input.shareCard,
					),
				errors,
			),
		),
		report: impl.jobs.report.handler(({ context, input, errors }) =>
			run(async () => {
				await service(context).report(
					humanOf(context, errors),
					input.id,
					input.reason,
				);
				return { success: true };
			}, errors),
		),
		mine: impl.jobs.mine.handler(({ context, errors }) => {
			const viewer = viewerOf(context);
			if (!viewer) {
				throw errors.UNAUTHORIZED();
			}
			return run(
				async () => ({ items: await service(context).mine(viewer.id) }),
				errors,
			);
		}),
		applicants: impl.jobs.applicants.handler(({ context, input, errors }) =>
			run(
				async () => ({
					items: await service(context).applicants(
						humanOf(context, errors),
						input.id,
					),
				}),
				errors,
			),
		),
	};
}

export function createTalentHandlers() {
	return {
		mine: impl.talent.mine.handler(({ context, errors }) => {
			const viewer = viewerOf(context);
			if (!viewer) {
				throw errors.UNAUTHORIZED();
			}
			return service(context).talent.mine(viewer.id);
		}),
		update: impl.talent.update.handler(({ context, input, errors }) =>
			service(context).talent.update(humanOf(context, errors), input),
		),
		directory: impl.talent.directory.handler(
			async ({ context, input, errors }) => {
				try {
					return await service(context).talent.directory(
						humanOf(context, errors),
						input,
					);
				} catch (err) {
					throw refuse(err, errors);
				}
			},
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

export function createJobsAdminHandlers() {
	const actor = (context: Sessioned) => {
		if (!context.session) {
			throw new ORPCError("UNAUTHORIZED");
		}
		return (context.session.user as { id: string }).id;
	};
	return {
		review: impl.admin.jobs.review
			.use(isStaff)
			.handler(({ context, input, errors }) =>
				service(context)
					.admin.review(input)
					.catch((err) => {
						throw refuse(err, errors);
					}),
			),
		uphold: impl.admin.jobs.uphold
			.use(isStaff)
			.handler(({ context, input, errors }) =>
				service(context)
					.admin.uphold(actor(context), input.id, input.reason)
					.catch((err) => {
						throw refuse(err, errors);
					}),
			),
		dismiss: impl.admin.jobs.dismiss
			.use(isStaff)
			.handler(({ context, input, errors }) =>
				service(context)
					.admin.dismiss(actor(context), input.id)
					.then(() => ({ success: true }))
					.catch((err) => {
						throw refuse(err, errors);
					}),
			),
	};
}
