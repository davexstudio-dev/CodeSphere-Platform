// Dates of a Hackathon that govern its Teams and Submissions (#261). They come from its Milestones:
// registration closes at `registration_close` when the Hackathon has one, else with the submissions;
// the submissions close at `submission_close`.

type Milestone = { key: string; startsAt: string };

const at = (milestones: readonly Milestone[], key: string) => {
	const found = milestones.find((m) => m.key === key);
	return found ? new Date(found.startsAt) : null;
};

export function deadlinesOf(milestones: readonly Milestone[]) {
	const submission = at(milestones, "submission_close");
	return {
		submissionClose: submission,
		registrationClose: at(milestones, "registration_close") ?? submission,
	};
}

/** Whether `deadline` has not passed. A Hackathon without that Milestone stays open. */
export const isOpen = (deadline: Date | null, now: Date) =>
	deadline === null || now.getTime() < deadline.getTime();

/** A random link token: 24 bytes of the platform's CSPRNG, URL-safe. */
export function newInviteToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	return Buffer.from(bytes).toString("base64url");
}
