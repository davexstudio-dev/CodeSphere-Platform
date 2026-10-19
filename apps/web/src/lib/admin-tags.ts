import { adminErrorKey } from "@/i18n/errors";

type TagLike = {
	questionCount: number;
	ownerHackathon: string | null;
	reserved?: boolean;
	system?: boolean;
};

export type TagGroup = "protected" | "used" | "unused";

/** The group of the Tags list (#117): the rule made visible. */
export function tagGroup(tag: TagLike): TagGroup {
	if (tag.ownerHackathon || tag.reserved) {
		return "protected";
	}
	return tag.questionCount > 0 ? "used" : "unused";
}

export type DeleteBlock =
	| { reason: "owned"; slug: string }
	| { reason: "reserved" }
	| { reason: "system" }
	| { reason: "used"; count: number };

/** Why a Tag cannot be deleted, or `null` when it can; the page words it before the action. */
export function deleteBlock(tag: TagLike): DeleteBlock | null {
	if (tag.ownerHackathon) {
		return { reason: "owned", slug: tag.ownerHackathon };
	}
	if (tag.system) {
		return { reason: "system" };
	}
	if (tag.reserved) {
		return { reason: "reserved" };
	}
	if (tag.questionCount > 0) {
		return { reason: "used", count: tag.questionCount };
	}
	return null;
}

export const tagMutationErrorKey = adminErrorKey;
