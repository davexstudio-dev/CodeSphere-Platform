import { ORPCError } from "@orpc/server";
import { requireAdmin } from "../authorization";

import { impl } from "../index";
import { PrivilegeError } from "../reputation/service";
import { defaultWriteQuota } from "../write-quota";
import { runIngestion } from "./ingest";
import {
	createWatchService,
	InvalidWatchCursorError,
	WatchError,
} from "./service";

type Errors = {
	UNAUTHORIZED: () => Error;
	FORBIDDEN: (options?: { message?: string }) => Error;
	NOT_FOUND: () => Error;
	CONFLICT: () => Error;
	BAD_REQUEST: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
};

// A refusal of the service as the contract's typed error.
const refuse = (err: unknown, errors: Partial<Errors>, path = "input") => {
	if (err instanceof InvalidWatchCursorError) {
		return (
			errors.BAD_REQUEST?.({
				data: { issues: [{ path: ["cursor"], message: "Invalid cursor" }] },
			}) ?? err
		);
	}
	if (err instanceof WatchError) {
		switch (err.code) {
			case "NOT_FOUND":
				return errors.NOT_FOUND?.() ?? err;
			case "FORBIDDEN":
				return errors.FORBIDDEN?.() ?? err;
			case "CONFLICT":
				return errors.CONFLICT?.() ?? err;
			case "BAD_REQUEST":
				return (
					errors.BAD_REQUEST?.({
						data: { issues: [{ path: [path], message: "Invalid value" }] },
					}) ?? err
				);
		}
	}
	return err;
};

const privilegeRefusal = (
	err: unknown,
	errors: {
		PRIVILEGE_REQUIRED: (options: {
			data: {
				privilege: PrivilegeError["privilege"];
				required: number;
				current: number;
			};
		}) => Error;
	},
) => {
	if (err instanceof PrivilegeError) {
		return errors.PRIVILEGE_REQUIRED({
			data: {
				privilege: err.privilege,
				required: err.required,
				current: err.current,
			},
		});
	}
	return err;
};

type Sessioned = {
	session: { user: { id: string } } | null;
};

const kindOf = (user: object) => (user as { kind?: string }).kind;

const memberOf = (context: Sessioned, errors: Pick<Errors, "UNAUTHORIZED">) => {
	if (!context.session) {
		throw errors.UNAUTHORIZED();
	}
	return context.session.user;
};

/** Votes, saves and reports belong to human Members: an Agent never votes (spec §2). */
const humanOf = (
	context: Sessioned,
	errors: Pick<Errors, "UNAUTHORIZED" | "FORBIDDEN">,
) => {
	const user = memberOf(context, errors);
	if (kindOf(user) === "agent") {
		throw errors.FORBIDDEN();
	}
	return user;
};

export function createWatchHandlers() {
	const service = (context: {
		db: Parameters<typeof createWatchService>[0];
		privilegeThresholds?: Parameters<typeof createWatchService>[1];
	}) => createWatchService(context.db, context.privilegeThresholds);

	return {
		list: impl.watch.list.handler(async ({ context, input, errors }) => {
			try {
				return await service(context).list(
					input,
					context.session ? { id: context.session.user.id } : null,
				);
			} catch (err) {
				if (err instanceof WatchError && err.code === "FORBIDDEN") {
					throw errors.UNAUTHORIZED();
				}
				throw refuse(err, errors);
			}
		}),

		submit: impl.watch.submit.handler(async ({ context, input, errors }) => {
			const user = memberOf(context, errors);
			const kind = kindOf(user) === "agent" ? "agent" : "human";
			const owner = (user as { ownerId?: unknown }).ownerId;
			const ownerId =
				kind === "agent" && typeof owner === "string" ? owner : null;
			try {
				return await service(context).submit({ id: user.id, kind }, input, () =>
					(context.writeQuota ?? defaultWriteQuota).consume(
						{ id: user.id, kind, ownerId },
						"feed_item",
					),
				);
			} catch (err) {
				throw refuse(privilegeRefusal(err, errors), errors, "url");
			}
		}),

		vote: impl.watch.vote.handler(async ({ context, input, errors }) => {
			const user = humanOf(context, errors);
			try {
				return await service(context).vote(user.id, input.itemId, input.value);
			} catch (err) {
				throw refuse(err, errors);
			}
		}),

		save: impl.watch.save.handler(async ({ context, input, errors }) => {
			const user = humanOf(context, errors);
			try {
				return await service(context).save(user.id, input.itemId, input.saved);
			} catch (err) {
				throw refuse(err, errors);
			}
		}),

		report: impl.watch.report.handler(async ({ context, input, errors }) => {
			const user = humanOf(context, errors);
			try {
				await service(context).report(user.id, input.itemId, input.reason);
				return { success: true };
			} catch (err) {
				throw refuse(privilegeRefusal(err, errors), errors);
			}
		}),
	};
}

const isStaff = impl.middleware(async ({ context, next }) => {
	const guard = requireAdmin(context.session);
	if (!guard.ok) {
		throw new ORPCError(guard.code);
	}
	return next();
});

export function createWatchAdminHandlers() {
	const admin = (context: Parameters<typeof service>[0]) =>
		service(context).admin;
	const service = (context: {
		db: Parameters<typeof createWatchService>[0];
		privilegeThresholds?: Parameters<typeof createWatchService>[1];
	}) => createWatchService(context.db, context.privilegeThresholds);
	const actor = (context: Sessioned) => {
		if (!context.session) {
			throw new ORPCError("UNAUTHORIZED");
		}
		return context.session.user.id;
	};
	const run = async <T>(work: () => Promise<T>, errors: Partial<Errors>) => {
		try {
			return await work();
		} catch (err) {
			throw refuse(err, errors);
		}
	};

	return {
		sources: {
			list: impl.admin.watch.sources.list
				.use(isStaff)
				.handler(async ({ context }) => ({
					items: await admin(context).sources(),
				})),
			create: impl.admin.watch.sources.create
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(() => admin(context).createSource(actor(context), input), errors),
				),
			update: impl.admin.watch.sources.update
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(() => admin(context).updateSource(actor(context), input), errors),
				),
			remove: impl.admin.watch.sources.remove
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(
						() => admin(context).removeSource(actor(context), input.id),
						errors,
					),
				),
		},
		items: {
			review: impl.admin.watch.items.review
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(() => admin(context).review(input), errors),
				),
			approve: impl.admin.watch.items.approve
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(async () => {
						await admin(context).approve(actor(context), input.itemId);
						return { success: true };
					}, errors),
				),
			remove: impl.admin.watch.items.remove
				.use(isStaff)
				.handler(({ context, input, errors }) =>
					run(async () => {
						await admin(context).removeItem(
							actor(context),
							input.itemId,
							input.reason,
						);
						return { success: true };
					}, errors),
				),
		},
		domains: {
			list: impl.admin.watch.domains.list
				.use(isStaff)
				.handler(async ({ context }) => ({
					items: await admin(context).domains(),
				})),
			block: impl.admin.watch.domains.block
				.use(isStaff)
				.handler(({ context, input }) =>
					run(
						() =>
							admin(context).blockDomain(
								actor(context),
								input.domain,
								input.reason,
							),
						{},
					),
				),
			unblock: impl.admin.watch.domains.unblock
				.use(isStaff)
				.handler(async ({ context, input }) => {
					await admin(context).unblockDomain(actor(context), input.domain);
					return { success: true };
				}),
		},
		ingest: impl.admin.watch.ingest
			.use(isStaff)
			.handler(({ context }) => runIngestion(context.db, context.watchFetch)),
	};
}
