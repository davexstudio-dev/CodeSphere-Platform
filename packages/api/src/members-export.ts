import type { Database } from "@codesphere/db";
import { user } from "@codesphere/db/schema/auth";
import {
	feedAffinity,
	feedMuted,
	feedPreferences,
} from "@codesphere/db/schema/feed";
import { jobApplications, talentCards } from "@codesphere/db/schema/jobs";
import { answers, questions, votes } from "@codesphere/db/schema/questions";
import { reputationEvents } from "@codesphere/db/schema/reputation";
import { tagFollows } from "@codesphere/db/schema/tags";
import { watchItemSaves, watchItems } from "@codesphere/db/schema/watch";
import { and, eq, isNull, ne, or } from "drizzle-orm";

import { ownProfile } from "./profile";
import { reputationOf } from "./reputation/service";

/**
 * The data the platform holds about a Member (spec §2): the portability counterpart of account
 * deletion. Agent keys are never included, only the Agents the Member owns.
 */
export async function exportMember(db: Database, memberId: string) {
	const [me] = await db.select().from(user).where(eq(user.id, memberId));
	if (!me) {
		return null;
	}
	const [
		qs,
		as,
		vs,
		journal,
		tags,
		agents,
		prefs,
		muted,
		affinity,
		kept,
		talent,
		applied,
	] = await Promise.all([
		db.select().from(questions).where(eq(questions.authorId, memberId)),
		db.select().from(answers).where(eq(answers.authorId, memberId)),
		db.select().from(votes).where(eq(votes.userId, memberId)),
		db
			.select()
			.from(reputationEvents)
			.where(eq(reputationEvents.userId, memberId))
			.orderBy(reputationEvents.createdAt, reputationEvents.id),
		db.select().from(tagFollows).where(eq(tagFollows.userId, memberId)),
		db
			.select()
			.from(user)
			.where(
				and(
					eq(user.ownerId, memberId),
					eq(user.kind, "agent"),
					or(
						isNull(user.suspensionReason),
						ne(user.suspensionReason, "deleted"),
					),
				),
			),
		db
			.select()
			.from(feedPreferences)
			.where(eq(feedPreferences.userId, memberId)),
		db.select().from(feedMuted).where(eq(feedMuted.userId, memberId)),
		db.select().from(feedAffinity).where(eq(feedAffinity.userId, memberId)),
		db
			.select({
				itemId: watchItems.id,
				url: watchItems.url,
				title: watchItems.title,
			})
			.from(watchItemSaves)
			.innerJoin(watchItems, eq(watchItems.id, watchItemSaves.itemId))
			.where(eq(watchItemSaves.userId, memberId)),
		db.select().from(talentCards).where(eq(talentCards.userId, memberId)),
		db
			.select()
			.from(jobApplications)
			.where(eq(jobApplications.userId, memberId)),
	]);
	return {
		exportedAt: new Date().toISOString(),
		profile: {
			...ownProfile(me, await reputationOf(db, me)),
			email: me.email,
			consentVersion: me.consentVersion,
			consentAcceptedAt: me.consentAcceptedAt?.toISOString() ?? null,
			createdAt: me.createdAt.toISOString(),
		},
		questions: qs.map((q) => ({
			id: q.id,
			title: q.title,
			body: q.body,
			language: q.language,
			status: q.status,
			tags: q.tags,
			score: q.score,
			createdAt: q.createdAt.toISOString(),
			deleted: q.deletedAt !== null,
		})),
		answers: as.map((a) => ({
			id: a.id,
			questionId: a.questionId,
			body: a.body,
			score: a.score,
			createdAt: a.createdAt.toISOString(),
			deleted: a.deletedAt !== null,
		})),
		votes: vs.map((v) => ({
			targetType: v.targetType,
			targetId: v.targetId,
			value: v.value > 0 ? ("up" as const) : ("down" as const),
			createdAt: v.createdAt.toISOString(),
		})),
		// Only the points the Member gained or lost: the other party of a vote is not named.
		reputationJournal: journal.map((event) => ({
			kind: event.kind,
			points: event.points,
			cause: event.cause,
			targetType: event.targetType,
			targetId: event.targetId,
			voidedReason: event.voidedReason,
			createdAt: event.createdAt.toISOString(),
		})),
		followedTags: tags.map((t) => t.tag),
		feedProfile: {
			personalization: prefs[0]?.personalization ?? true,
			language: prefs[0]?.language ?? null,
			muted: muted.map((m) => ({ kind: m.kind, key: m.key })),
			affinity: affinity.map((a) => ({ tag: a.tag, weight: a.weight })),
		},
		keptItems: kept,
		talentCard: talent[0]
			? {
					enabled: talent[0].enabled,
					openToContact: talent[0].openToContact,
					headline: talent[0].headline,
					codeUrl: talent[0].codeUrl,
					contactEmail: talent[0].contactEmail,
				}
			: null,
		jobApplications: applied.map((a) => ({
			jobId: a.jobId,
			sharedCard: a.sharedCard,
			createdAt: a.createdAt.toISOString(),
		})),
		agents: agents.map((a) => ({
			id: a.id,
			name: a.name,
			createdAt: a.createdAt.toISOString(),
		})),
	};
}
