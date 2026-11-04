import type {
	AgentActivityGroup,
	AgentActivityItem,
} from "@codesphere/contract";
import type { Database } from "@codesphere/db";
import { agentPauses, agentRejections } from "@codesphere/db/schema/agents";
import { auditLog } from "@codesphere/db/schema/audit";
import { and, desc, eq, isNotNull, like, lte, ne } from "drizzle-orm";

import { createAnswerService } from "../answers/service";

/**
 * The Agent activity history (#294), rebuilt from what the platform keeps: no table of API calls.
 * Each source is read most recent first up to the cursor, the sources are merged, and one page is
 * cut from the merge. The cursor is the (time, id) of the last item served.
 */

type Cursor = { at: Date; id: string };

export function encodeCursor(item: { at: string; id: string }) {
	return Buffer.from(`${item.at}|${item.id}`).toString("base64url");
}

export function decodeCursor(cursor: string | undefined): Cursor | null {
	if (!cursor) {
		return null;
	}
	const [at, ...rest] = Buffer.from(cursor, "base64url").toString().split("|");
	const date = new Date(at ?? "");
	const id = rest.join("|");
	return Number.isNaN(date.getTime()) || !id ? null : { at: date, id };
}

/** Strictly after the cursor in the « most recent first » order: older, or as old with a smaller id. */
export function isAfter(item: { at: string; id: string }, cursor: Cursor) {
	const at = new Date(item.at).getTime();
	const c = cursor.at.getTime();
	return at < c || (at === c && item.id < cursor.id);
}

/** Merges the sources into one page, most recent first, and says where the next one starts. */
export function pageOf(
	sources: AgentActivityItem[][],
	cursor: Cursor | null,
	limit: number,
) {
	const merged = sources
		.flat()
		.filter((item) => !cursor || isAfter(item, cursor))
		.sort((a, b) =>
			a.at === b.at
				? b.id.localeCompare(a.id)
				: new Date(b.at).getTime() - new Date(a.at).getTime(),
		);
	const items = merged.slice(0, limit);
	const last = items.at(-1);
	return {
		items,
		nextCursor: merged.length > limit && last ? encodeCursor(last) : null,
	};
}

const GROUPS: Record<AgentActivityGroup, AgentActivityItem["kind"][]> = {
	content: ["question", "answer"],
	rejections: ["rejection"],
	management: ["pause", "resume", "management"],
};

export async function agentActivity(
	db: Database,
	agentId: string,
	input: { group?: AgentActivityGroup; cursor?: string; limit: number },
) {
	const cursor = decodeCursor(input.cursor);
	const wanted = (kind: AgentActivityItem["kind"]) =>
		!input.group || GROUPS[input.group].includes(kind);
	// Each source may fill the page alone; one more row tells whether a next page exists.
	const take = input.limit + 1;
	const upTo = <T>(column: T) =>
		cursor ? lte(column as never, cursor.at) : undefined;
	const iso = (date: Date) => date.toISOString();
	const none: Promise<AgentActivityItem[]> = Promise.resolve([]);

	// Questions and Answers belong to the Q&A module: read through its service (ADR 0001).
	const qa = createAnswerService(db);
	const content =
		wanted("question") || wanted("answer")
			? qa.authoredContent(agentId, cursor?.at ?? null, take)
			: Promise.resolve({ asked: [], answered: [] });

	const [written, rejectedRows, paused, resumed, managed] = await Promise.all([
		content,
		wanted("rejection")
			? db
					.select({
						id: agentRejections.answerId,
						at: agentRejections.rejectedAt,
					})
					.from(agentRejections)
					.where(
						and(
							eq(agentRejections.agentId, agentId),
							upTo(agentRejections.rejectedAt),
						),
					)
					.orderBy(desc(agentRejections.rejectedAt))
					.limit(take)
			: Promise.resolve([] as { id: string; at: Date }[]),
		wanted("pause")
			? db
					.select({ id: agentPauses.id, at: agentPauses.pausedAt })
					.from(agentPauses)
					.where(
						and(eq(agentPauses.agentId, agentId), upTo(agentPauses.pausedAt)),
					)
					.orderBy(desc(agentPauses.pausedAt))
					.limit(take)
					.then((rows) =>
						rows.map(
							(r): AgentActivityItem => ({
								id: `p:${r.id}`,
								kind: "pause",
								at: iso(r.at),
								questionId: null,
								questionTitle: null,
								action: null,
								deleted: false,
							}),
						),
					)
			: none,
		wanted("resume")
			? db
					.select({ id: agentPauses.id, at: agentPauses.endedAt })
					.from(agentPauses)
					.where(
						and(
							eq(agentPauses.agentId, agentId),
							isNotNull(agentPauses.endedAt),
							upTo(agentPauses.endedAt),
						),
					)
					.orderBy(desc(agentPauses.endedAt))
					.limit(take)
					.then((rows) =>
						rows.flatMap((r): AgentActivityItem[] =>
							r.at
								? [
										{
											id: `e:${r.id}`,
											kind: "resume",
											at: iso(r.at),
											questionId: null,
											questionTitle: null,
											action: null,
											deleted: false,
										},
									]
								: [],
						),
					)
			: none,
		// The pause has its own row above: its audit event would show it twice.
		wanted("management")
			? db
					.select({
						id: auditLog.id,
						at: auditLog.createdAt,
						action: auditLog.action,
					})
					.from(auditLog)
					.where(
						and(
							eq(auditLog.targetType, "agent"),
							eq(auditLog.targetId, agentId),
							like(auditLog.action, "agent.%"),
							ne(auditLog.action, "agent.pause"),
							upTo(auditLog.createdAt),
						),
					)
					.orderBy(desc(auditLog.createdAt))
					.limit(take)
					.then((rows) =>
						rows.map(
							(r): AgentActivityItem => ({
								id: `m:${r.id}`,
								kind: "management",
								at: iso(r.at),
								questionId: null,
								questionTitle: null,
								action: r.action,
								deleted: false,
							}),
						),
					)
			: none,
	]);

	const asked = wanted("question")
		? written.asked.map(
				(r): AgentActivityItem => ({
					id: `q:${r.id}`,
					kind: "question",
					at: iso(r.at),
					questionId: r.id,
					questionTitle: r.title,
					action: null,
					deleted: r.deletedAt !== null,
				}),
			)
		: [];
	const answered = wanted("answer")
		? written.answered.map(
				(r): AgentActivityItem => ({
					id: `a:${r.id}`,
					kind: "answer",
					at: iso(r.at),
					questionId: r.questionId,
					questionTitle: r.title,
					action: null,
					deleted: r.deletedAt !== null,
				}),
			)
		: [];
	const onQuestion = await qa.questionsOfAnswers(rejectedRows.map((r) => r.id));
	const rejected = rejectedRows.map(
		(r): AgentActivityItem => ({
			id: `r:${r.id}`,
			kind: "rejection",
			at: iso(r.at),
			questionId: onQuestion.get(r.id)?.questionId ?? null,
			questionTitle: onQuestion.get(r.id)?.title ?? null,
			action: null,
			deleted: !onQuestion.has(r.id),
		}),
	);

	return pageOf(
		[asked, answered, rejected, paused, resumed, managed],
		cursor,
		input.limit,
	);
}
