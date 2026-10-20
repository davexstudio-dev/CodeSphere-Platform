import { ORPCError } from "@orpc/server";

import { impl } from "../index";
import { staffMay } from "../staff-guard";
import {
	createOrganizationService,
	type Decision,
	InvalidOrganizationCursorError,
	OrganizationError,
} from "./service";

type Errors = {
	UNAUTHORIZED?: () => Error;
	NOT_FOUND?: () => Error;
	CONFLICT?: (options?: { message?: string }) => Error;
	BAD_REQUEST?: (options: {
		data: { issues: { path: string[]; message: string }[] };
	}) => Error;
};

const MESSAGES: Record<string, string> = {
	contactEmail: "The contact email must be on the Organization's own domain.",
	name: "The name must contain letters or digits.",
	limit: "Too many open applications.",
	slug: "An Organization with this name already exists.",
};

// The typed refusal of the service.
const refuse = (err: unknown, errors: Errors) => {
	if (err instanceof InvalidOrganizationCursorError) {
		return (
			errors.BAD_REQUEST?.({
				data: { issues: [{ path: ["cursor"], message: "Invalid cursor" }] },
			}) ?? err
		);
	}
	if (err instanceof OrganizationError) {
		if (err.code === "NOT_FOUND") {
			return errors.NOT_FOUND?.() ?? err;
		}
		if (err.code === "CONFLICT") {
			return errors.CONFLICT?.({ message: MESSAGES[err.path ?? ""] }) ?? err;
		}
		return (
			errors.BAD_REQUEST?.({
				data: {
					issues: [
						{
							path: [err.path ?? "input"],
							message: MESSAGES[err.path ?? ""] ?? "Invalid value",
						},
					],
				},
			}) ?? err
		);
	}
	return err;
};

type Sessioned = { session: { user: object } | null };

// An Organization is requested by a human Member: an Agent never applies on anyone's behalf.
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

export function createOrganizationsHandlers() {
	return {
		get: impl.organizations.get.handler(async ({ context, input, errors }) => {
			try {
				return await createOrganizationService(context.db).profile(input.slug);
			} catch (err) {
				throw refuse(err, errors);
			}
		}),
		list: impl.organizations.list.handler(
			async ({ context, input, errors }) => {
				try {
					return await createOrganizationService(context.db).list(input);
				} catch (err) {
					throw refuse(err, errors);
				}
			},
		),
		request: impl.organizations.request.handler(
			async ({ context, input, errors }) => {
				const userId = humanOf(context, errors);
				try {
					return await createOrganizationService(context.db).apply(
						userId,
						input,
					);
				} catch (err) {
					throw refuse(err, errors);
				}
			},
		),
		mine: impl.organizations.mine.handler(async ({ context, errors }) => {
			if (!context.session) {
				throw errors.UNAUTHORIZED();
			}
			return {
				items: await createOrganizationService(context.db).mine(
					context.session.user.id,
				),
			};
		}),
	};
}

export function createOrganizationsAdminHandlers() {
	const actor = (context: Sessioned) => {
		if (!context.session) {
			throw new ORPCError("UNAUTHORIZED");
		}
		return (context.session.user as { id: string }).id;
	};
	const decide =
		(decision: Decision) =>
		async ({
			context,
			input,
			errors,
		}: {
			context: Parameters<typeof actor>[0] & {
				db: Parameters<typeof createOrganizationService>[0];
			};
			input: { id: string; expectedVersion: number; reason?: string };
			errors: Errors;
		}) => {
			try {
				return await createOrganizationService(context.db).admin.decide(
					actor(context),
					decision,
					input,
				);
			} catch (err) {
				throw refuse(err, errors);
			}
		};

	return {
		list: impl.admin.organizations.list
			.use(staffMay({ organization: ["manage"] }))
			.handler(({ context, input, errors }) =>
				createOrganizationService(context.db)
					.admin.list(input)
					.catch((err) => {
						throw refuse(err, errors);
					}),
			),
		validate: impl.admin.organizations.validate
			.use(staffMay({ organization: ["manage"] }))
			.handler(decide("validate")),
		reject: impl.admin.organizations.reject
			.use(staffMay({ organization: ["manage"] }))
			.handler(decide("reject")),
		suspend: impl.admin.organizations.suspend
			.use(staffMay({ organization: ["manage"] }))
			.handler(decide("suspend")),
		reinstate: impl.admin.organizations.reinstate
			.use(staffMay({ organization: ["manage"] }))
			.handler(decide("reinstate")),
	};
}
