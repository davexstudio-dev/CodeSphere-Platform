import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import {
	organization,
	organizationInvitation,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Consumer } from "./consumer";

// The three service emails of the Organization space (#337). Sent from the outbox, never from a
// handler: an Admin's decision does not wait for a mail, and a transient failure is retried. The
// consumer reads the CURRENT state of what the event is about and sends nothing when it changed.

export const ORGANIZATION_INVITED = "organization.invited";
export const HACKATHON_UNPUBLISHED = "hackathon.unpublished";
export const ORGANIZATION_SUSPENDED = "organization.suspended";

type Locale = "fr" | "en";

/** The messages of packages/email this consumer composes; the server maps them to `composeEmail`. */
export type OrgMailMessage =
	| {
			kind: "organization-invitation";
			props: {
				name: string;
				invitedBy: string | null;
				organizationName: string;
				role: "editor" | "owner";
				url?: string;
				locale?: Locale;
			};
	  }
	| {
			kind: "hackathon-unpublished";
			props: {
				name: string;
				hackathonName: string;
				organizationName: string;
				reason: string;
				url?: string;
				locale?: Locale;
			};
	  }
	| {
			kind: "organization-suspended";
			props: {
				name: string;
				organizationName: string;
				reason?: string;
				contactEmail?: string;
				locale?: Locale;
			};
	  };

export type OrgMailer = {
	send(input: {
		to: string;
		/** Per event and recipient: a crash between the send and the marker never sends twice. */
		idempotencyKey: string;
		message: OrgMailMessage;
	}): Promise<
		| { status: "sent" }
		| { status: "disabled" }
		| { status: "failed"; message: string }
	>;
};

export type OrgMailConfig = {
	/** Null/absent without an email service key: events are handled with a log line. */
	mailer?: OrgMailer | null;
	/** Public origin of the web app, for the links. */
	siteUrl?: string;
	/** Contact address of the legal page, for the suspension. Optional until it is published. */
	contactEmail?: string;
	log?: (line: string) => void;
};

type Recipient = {
	id: string;
	email: string;
	name: string;
	locale: Locale | null;
};

// A human, verified, not suspended (a deleted account is suspended with the reason `deleted`).
const eligible = [
	eq(user.kind, "human"),
	eq(user.emailVerified, true),
	isNull(user.suspendedAt),
];

const recipientColumns = {
	id: user.id,
	email: user.email,
	name: user.name,
	locale: user.locale,
};

const link = (siteUrl: string | undefined, path: string) =>
	siteUrl ? `${siteUrl.replace(/\/+$/, "")}${path}` : undefined;

export function orgMailConsumer(config: OrgMailConfig = {}): Consumer {
	const log = config.log ?? ((line: string) => console.info(line));

	async function owners(db: Database, organizationId: string) {
		const [row] = await db
			.select({ ownerId: organization.ownerId })
			.from(organization)
			.where(eq(organization.id, organizationId));
		const people: Recipient[] = [];
		if (row?.ownerId) {
			people.push(
				...(await db
					.select(recipientColumns)
					.from(user)
					.where(and(eq(user.id, row.ownerId), ...eligible))),
			);
		}
		const editors = await db
			.select(recipientColumns)
			.from(organizationMember)
			.innerJoin(user, eq(user.id, organizationMember.userId))
			.where(
				and(eq(organizationMember.organizationId, organizationId), ...eligible),
			);
		const seen = new Set(people.map((p) => p.id));
		return [...people, ...editors.filter((e) => !seen.has(e.id))];
	}

	/** The mails to send for an event, from the state at this moment. Empty when nothing is due. */
	async function plan(
		db: Database,
		type: string,
		aggregateId: string,
	): Promise<{ to: Recipient; message: OrgMailMessage }[]> {
		if (type === ORGANIZATION_INVITED) {
			const inviter = alias(user, "inviter");
			const [row] = await db
				.select({
					role: organizationInvitation.role,
					organizationName: organization.name,
					invitedByName: inviter.name,
					inviteeId: organizationInvitation.inviteeId,
				})
				.from(organizationInvitation)
				.innerJoin(
					organization,
					eq(organization.id, organizationInvitation.organizationId),
				)
				.leftJoin(inviter, eq(inviter.id, organizationInvitation.invitedBy))
				.where(
					and(
						eq(organizationInvitation.id, aggregateId),
						eq(organizationInvitation.status, "pending"),
						eq(organization.status, "validated"),
					),
				);
			if (!row) {
				return [];
			}
			const [invitee] = await db
				.select(recipientColumns)
				.from(user)
				.where(and(eq(user.id, row.inviteeId), ...eligible));
			if (!invitee) {
				return [];
			}
			return [
				{
					to: invitee,
					message: {
						kind: "organization-invitation",
						props: {
							name: invitee.name,
							invitedBy: row.invitedByName,
							organizationName: row.organizationName,
							role: row.role,
							url: link(config.siteUrl, "/organizations/new"),
							locale: invitee.locale ?? undefined,
						},
					},
				},
			];
		}

		if (type === HACKATHON_UNPUBLISHED) {
			const [row] = await db
				.select({
					name: hackathon.name,
					reason: hackathon.unpublishedReason,
					organizationId: organization.id,
					organizationName: organization.name,
					slug: organization.slug,
				})
				.from(hackathon)
				.innerJoin(organization, eq(organization.id, hackathon.organizationId))
				.where(
					and(
						eq(hackathon.id, aggregateId),
						eq(hackathon.status, "draft"),
						isNotNull(hackathon.unpublishedReason),
					),
				);
			if (!row?.reason) {
				return [];
			}
			const reason = row.reason;
			return (await owners(db, row.organizationId)).map((to) => ({
				to,
				message: {
					kind: "hackathon-unpublished",
					props: {
						name: to.name,
						hackathonName: row.name,
						organizationName: row.organizationName,
						reason,
						url: link(config.siteUrl, `/organizations/${row.slug}/manage`),
						locale: to.locale ?? undefined,
					},
				},
			}));
		}

		if (type === ORGANIZATION_SUSPENDED) {
			const [row] = await db
				.select({
					id: organization.id,
					name: organization.name,
					reason: organization.statusReason,
				})
				.from(organization)
				.where(
					and(
						eq(organization.id, aggregateId),
						eq(organization.status, "suspended"),
					),
				);
			if (!row) {
				return [];
			}
			return (await owners(db, row.id)).map((to) => ({
				to,
				message: {
					kind: "organization-suspended",
					props: {
						name: to.name,
						organizationName: row.name,
						reason: row.reason ?? undefined,
						contactEmail: config.contactEmail,
						locale: to.locale ?? undefined,
					},
				},
			}));
		}
		return [];
	}

	return {
		name: "org-mail",
		types: [
			ORGANIZATION_INVITED,
			HACKATHON_UNPUBLISHED,
			ORGANIZATION_SUSPENDED,
		],
		// A mail cannot share a statement with its marker: the provider's idempotency key covers the gap.
		async handle(message, db) {
			if (!config.mailer) {
				log(
					`org-mail: no email service, ${message.type} ${message.id} skipped`,
				);
				return;
			}
			const mails = await plan(db, message.type, message.aggregateId);
			let failed = 0;
			for (const { to, message: mail } of mails) {
				const result = await config.mailer.send({
					to: to.email,
					idempotencyKey: `org-mail/${message.id}/${to.id}`,
					message: mail,
				});
				if (result.status === "failed") {
					failed += 1;
					log(
						`org-mail: ${message.type} ${message.id} not sent: ${result.message}`,
					);
				} else if (result.status === "disabled") {
					log(
						`org-mail: no email service, ${message.type} ${message.id} skipped`,
					);
					return;
				}
			}
			if (failed > 0) {
				// The outbox retries the event; the recipients already served are not mailed twice.
				throw new Error(
					`org-mail: ${failed} email(s) failed for ${message.id}`,
				);
			}
		},
	};
}
