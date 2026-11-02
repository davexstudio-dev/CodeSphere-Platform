import * as z from "zod";

import { AdminHackathon, HackathonCreate, HackathonUpdate } from "./admin";
import { base, ExpectedVersion } from "./base";
import { Hackathon } from "./hackathons";

export const OrganizationTerms = z.object({
	/** The version in force (#341): a counter raised by an important change of the text. */
	version: z.string(),
	/** Whether this Organization accepted that version. */
	accepted: z.boolean(),
	acceptedAt: z.iso.datetime().nullable(),
	acceptedByName: z.string().nullable(),
});

export type OrganizationTerms = z.infer<typeof OrganizationTerms>;

const errors = {
	UNAUTHORIZED: {},
	FORBIDDEN: {},
	NOT_FOUND: {},
	CONFLICT: { data: z.object({ version: z.number() }) },
} as const;

/**
 * The Hackathons of an Organization, run by its team without an Admin (#326). The owner and the
 * editors may call them; to anyone else the Organization does not exist (NOT_FOUND). Only a
 * validated Organization created by a Member can: the CADEV's stays with the Admins. Humans only,
 * not exposed over REST. Audited like the Admin's own writes.
 */
export const organizationHackathonsContract = {
	list: base
		.errors(errors)
		.input(z.object({ organizationId: z.uuid() }))
		.output(z.object({ items: z.array(AdminHackathon) })),
	/** Creates a draft listed by this Organization. */
	create: base.errors(errors).input(HackathonCreate).output(Hackathon),
	/** draft to published to ended to archived; never back. */
	advance: base
		.errors(errors)
		.input(z.object({ slug: z.string(), expectedVersion: ExpectedVersion }))
		.output(Hackathon),
	/** The Organization of a Hackathon cannot be changed from here. */
	update: base.errors(errors).input(HackathonUpdate).output(Hackathon),
	terms: {
		get: base
			.errors(errors)
			.input(z.object({ organizationId: z.uuid() }))
			.output(OrganizationTerms),
		/** The owner accepts the version in force; publishing a draft needs it. Idempotent. */
		accept: base
			.errors(errors)
			.input(z.object({ organizationId: z.uuid(), version: z.string() }))
			.output(OrganizationTerms),
	},
};
