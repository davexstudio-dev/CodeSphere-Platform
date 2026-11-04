/// <reference types="bun" />
// Integration test of the Organization emails (#337) against a real Postgres, with a fake email
// client: one mail per event and recipient, nothing when the state changed, nothing to ineligible
// accounts, handled without a key, retried after a failure.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDb } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import { hackathon } from "@codesphere/db/schema/hackathons";
import {
	organization,
	organizationInvitation,
	organizationMember,
} from "@codesphere/db/schema/organizations";
import { processedEvents } from "@codesphere/db/schema/outbox";
import { eq, inArray, like } from "drizzle-orm";

import { deliver } from "./consumer";
import {
	HACKATHON_UNPUBLISHED,
	ORGANIZATION_INVITED,
	ORGANIZATION_SUSPENDED,
	type OrgMailer,
	orgMailConsumer,
} from "./org-mail-consumer";
import type { QueueMessage } from "./relay";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Organization emails on Postgres", () => {
	const db = createDb({ DATABASE_URL: url ?? "" });
	const run = crypto.randomUUID().slice(0, 8);
	const id = (name: string) => `it-orgmail-${run}-${name}`;
	const eventIds: string[] = [];

	/** A fake email client that records what it was asked to send. */
	const fakeMailer = (result: "sent" | "disabled" | "failed" = "sent") => {
		const sent: Parameters<OrgMailer["send"]>[0][] = [];
		const mailer: OrgMailer = {
			async send(input) {
				sent.push(input);
				return result === "failed"
					? { status: "failed", message: "boom" }
					: { status: result };
			},
		};
		return { sent, mailer };
	};

	const consumerWith = (mailer: OrgMailer | null) =>
		orgMailConsumer({
			mailer,
			siteUrl: "https://site.test",
			contactEmail: "contact@site.test",
			log: () => undefined,
		});

	const event = (
		type: string,
		aggregateId: string,
		aggregateType: string,
	): QueueMessage => {
		const message = {
			id: crypto.randomUUID(),
			type,
			aggregateType,
			aggregateId,
			payload: {},
			createdAt: new Date().toISOString(),
		};
		eventIds.push(message.id);
		return message;
	};

	const orgId = crypto.randomUUID();
	const hackathonId = crypto.randomUUID();
	const invitationId = crypto.randomUUID();

	const member = (
		name: string,
		extra: Partial<typeof user.$inferInsert> = {},
	) => ({
		id: id(name),
		name,
		email: `${id(name)}@example.com`,
		emailVerified: true,
		...extra,
	});

	beforeAll(async () => {
		await db
			.insert(user)
			.values([
				member("owner", { locale: "fr" }),
				member("editor"),
				member("unverified", { emailVerified: false }),
				member("suspended", { suspendedAt: new Date() }),
				member("invitee"),
			]);
		await db.insert(organization).values({
			id: orgId,
			slug: `orgmail-${run}`,
			name: "Acme",
			website: "https://acme.example.org",
			country: "SN",
			status: "validated",
			ownerId: id("owner"),
		});
		await db.insert(organizationMember).values([
			{ organizationId: orgId, userId: id("editor") },
			{ organizationId: orgId, userId: id("unverified") },
			{ organizationId: orgId, userId: id("suspended") },
		]);
		await db.insert(hackathon).values({
			id: hackathonId,
			slug: `orgmail-h-${run}`,
			name: "Hack",
			organizationId: orgId,
			summary: "s",
			status: "draft",
			unpublishedReason: "Not a hackathon",
			teamMin: 1,
			teamMax: 4,
			sourceUrl: "https://acme.example.org/h",
			verifiedAt: new Date(),
		});
		await db.insert(organizationInvitation).values({
			id: invitationId,
			organizationId: orgId,
			inviteeId: id("invitee"),
			invitedBy: id("owner"),
			role: "editor",
		});
	});

	afterAll(async () => {
		if (eventIds.length) {
			await db
				.delete(processedEvents)
				.where(inArray(processedEvents.eventId, eventIds));
		}
		await db.delete(hackathon).where(eq(hackathon.id, hackathonId));
		await db.delete(organization).where(eq(organization.id, orgId));
		await db.delete(user).where(like(user.id, `it-orgmail-${run}-%`));
	});

	test("an invitation is mailed to the invitee, once even if the event is replayed", async () => {
		const { sent, mailer } = fakeMailer();
		const consumer = consumerWith(mailer);
		const message = event(ORGANIZATION_INVITED, invitationId, "invitation");
		await deliver(db, [consumer], message);
		await deliver(db, [consumer], message);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe(`${id("invitee")}@example.com`);
		expect(sent[0]?.idempotencyKey).toBe(
			`org-mail/${message.id}/${id("invitee")}`,
		);
		expect(sent[0]?.message).toMatchObject({
			kind: "organization-invitation",
			props: {
				organizationName: "Acme",
				role: "editor",
				url: "https://site.test/organizations/new",
			},
		});
	});

	test("an invitation that is no longer pending sends nothing", async () => {
		await db
			.update(organizationInvitation)
			.set({ status: "cancelled" })
			.where(eq(organizationInvitation.id, invitationId));
		const { sent, mailer } = fakeMailer();
		await deliver(
			db,
			[consumerWith(mailer)],
			event(ORGANIZATION_INVITED, invitationId, "invitation"),
		);
		expect(sent).toHaveLength(0);
		await db
			.update(organizationInvitation)
			.set({ status: "pending" })
			.where(eq(organizationInvitation.id, invitationId));
	});

	test("an unpublication reaches the owner and the editors, not unverified or suspended accounts", async () => {
		const { sent, mailer } = fakeMailer();
		await deliver(
			db,
			[consumerWith(mailer)],
			event(HACKATHON_UNPUBLISHED, hackathonId, "hackathon"),
		);
		expect(sent.map((s) => s.to).sort()).toEqual(
			[`${id("editor")}@example.com`, `${id("owner")}@example.com`].sort(),
		);
		const toOwner = sent.find((s) => s.to === `${id("owner")}@example.com`);
		expect(toOwner?.message).toMatchObject({
			kind: "hackathon-unpublished",
			props: {
				hackathonName: "Hack",
				reason: "Not a hackathon",
				locale: "fr",
				url: `https://site.test/organizations/orgmail-${run}/manage`,
			},
		});
		const toEditor = sent.find((s) => s.to === `${id("editor")}@example.com`);
		expect(toEditor?.message.props.locale).toBeUndefined();
	});

	test("a Hackathon whose lock was lifted sends nothing", async () => {
		await db
			.update(hackathon)
			.set({ unpublishedReason: null })
			.where(eq(hackathon.id, hackathonId));
		const { sent, mailer } = fakeMailer();
		await deliver(
			db,
			[consumerWith(mailer)],
			event(HACKATHON_UNPUBLISHED, hackathonId, "hackathon"),
		);
		expect(sent).toHaveLength(0);
		await db
			.update(hackathon)
			.set({ unpublishedReason: "Not a hackathon" })
			.where(eq(hackathon.id, hackathonId));
	});

	test("a suspension carries the reason and the contact address; a reinstated Organization sends nothing", async () => {
		await db
			.update(organization)
			.set({ status: "suspended", statusReason: "Fake event" })
			.where(eq(organization.id, orgId));
		const first = fakeMailer();
		await deliver(
			db,
			[consumerWith(first.mailer)],
			event(ORGANIZATION_SUSPENDED, orgId, "organization"),
		);
		expect(first.sent).toHaveLength(2);
		expect(first.sent[0]?.message).toMatchObject({
			kind: "organization-suspended",
			props: { reason: "Fake event", contactEmail: "contact@site.test" },
		});

		await db
			.update(organization)
			.set({ status: "validated" })
			.where(eq(organization.id, orgId));
		const second = fakeMailer();
		await deliver(
			db,
			[consumerWith(second.mailer)],
			event(ORGANIZATION_SUSPENDED, orgId, "organization"),
		);
		expect(second.sent).toHaveLength(0);
	});

	test("without an email service the event is handled without error", async () => {
		const message = event(HACKATHON_UNPUBLISHED, hackathonId, "hackathon");
		const result = await deliver(db, [consumerWith(null)], message);
		expect(result.handled).toEqual(["org-mail"]);
		const disabled = fakeMailer("disabled");
		const other = event(HACKATHON_UNPUBLISHED, hackathonId, "hackathon");
		const again = await deliver(db, [consumerWith(disabled.mailer)], other);
		expect(again.handled).toEqual(["org-mail"]);
	});

	test("a failed send fails the event so the outbox retries it, then a replay sends it", async () => {
		const message = event(HACKATHON_UNPUBLISHED, hackathonId, "hackathon");
		const broken = fakeMailer("failed");
		await expect(
			deliver(db, [consumerWith(broken.mailer)], message),
		).rejects.toThrow();
		const healthy = fakeMailer();
		await deliver(db, [consumerWith(healthy.mailer)], message);
		expect(healthy.sent).toHaveLength(2);
	});
});
