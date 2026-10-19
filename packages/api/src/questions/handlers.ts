import { AnswerError, createAnswerService } from "../answers/service";
import { requireAdmin } from "../authorization";
import { impl } from "../index";
import { answerLimiter, consume, questionLimiter } from "../rate-limit";
import { PrivilegeError } from "../reputation/service";
import { createVoteService, VoteError } from "../votes/service";
import { authorsById, UNKNOWN_AUTHOR, votesOf } from "./authors";
import { createListingService, InvalidCursorError } from "./listing";
import { createQuestionService, QuestionError } from "./service";

// Each request builds its service from the request's database (context.db), as the other routers do.
export function createQuestionsHandlers() {
	return {
		create: impl.questions.create.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				// 10 Questions per hour and Member (#72): counted before the write, replays included.
				await consume(questionLimiter, userId);

				try {
					return await createQuestionService(context.db).createQuestion(
						userId,
						input,
					);
				} catch (err) {
					if (err instanceof QuestionError && err.code === "VALIDATION") {
						throw errors.BAD_REQUEST({
							data: {
								issues: [{ path: ["tags"], message: "Tags must be 1–5" }],
							},
						});
					}
					throw err;
				}
			},
		),

		list: impl.questions.list.handler(async ({ context, input, errors }) => {
			try {
				return await createListingService(context.db).list(input);
			} catch (err) {
				if (err instanceof InvalidCursorError) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [{ path: ["cursor"], message: "Invalid cursor" }],
						},
					});
				}
				throw err;
			}
		}),

		get: impl.questions.get.handler(async ({ context, input, errors }) => {
			try {
				const question = await createQuestionService(context.db).getQuestion(
					input.id,
				);
				const [extras, mine] = await Promise.all([
					createListingService(context.db).extrasFor([question]),
					votesOf(context.db, context.session?.user.id ?? null, "question", [
						question.id,
					]),
				]);
				return {
					...question,
					...(extras.get(question.id) ?? {
						...UNKNOWN_AUTHOR,
						answerCount: 0,
					}),
					myVote: mine.get(question.id) ?? null,
				};
			} catch (err) {
				if (err instanceof QuestionError && err.code === "NOT_FOUND") {
					throw errors.NOT_FOUND();
				}
				throw err;
			}
		}),

		update: impl.questions.update.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).updateQuestion(
						userId,
						input,
					);
				} catch (err) {
					if (err instanceof QuestionError) {
						if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
						if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
						if (err.code === "CONFLICT") {
							throw errors.CONFLICT({
								data: { version: err.currentVersion ?? 0 },
							});
						}
					}
					throw err;
				}
			},
		),

		close: impl.questions.close.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}

			try {
				return await createQuestionService(context.db).closeQuestion(
					{ id: userId, isStaff: requireAdmin(context.session).ok },
					input.id,
					input.expectedVersion,
				);
			} catch (err) {
				if (err instanceof QuestionError) {
					if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
					if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
					if (err.code === "CONFLICT") {
						throw errors.CONFLICT({
							data: { version: err.currentVersion ?? 0 },
						});
					}
				}
				throw err;
			}
		}),

		reopen: impl.questions.reopen.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).reopenQuestion(
						{ id: userId, isStaff: requireAdmin(context.session).ok },
						input.id,
						input.expectedVersion,
					);
				} catch (err) {
					if (err instanceof QuestionError) {
						if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
						if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
						if (err.code === "CONFLICT") {
							throw errors.CONFLICT({
								data: { version: err.currentVersion ?? 0 },
							});
						}
					}
					throw err;
				}
			},
		),

		delete: impl.questions.delete.handler(
			async ({ context, input, errors }) => {
				const userId = context.session?.user.id;
				if (!userId) {
					throw errors.UNAUTHORIZED();
				}

				try {
					return await createQuestionService(context.db).softDeleteQuestion(
						userId,
						input.id,
						input.expectedVersion,
					);
				} catch (err) {
					if (err instanceof QuestionError) {
						if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
						if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
						if (err.code === "CONFLICT") {
							throw errors.CONFLICT({
								data: { version: err.currentVersion ?? 0 },
							});
						}
					}
					throw err;
				}
			},
		),
	};
}

// The For You feed is for humans (spec §2): a visitor is UNAUTHORIZED and an Agent FORBIDDEN.
export function createFeedHandlers() {
	return {
		forYou: impl.feed.forYou.handler(async ({ context, input, errors }) => {
			const user = context.session?.user as
				| { id: string; kind?: string }
				| undefined;
			if (!user) {
				throw errors.UNAUTHORIZED();
			}
			if (user.kind !== "human") {
				throw errors.FORBIDDEN();
			}
			try {
				return await createListingService(context.db).forYou(user.id, input);
			} catch (err) {
				if (err instanceof InvalidCursorError) {
					throw errors.BAD_REQUEST({
						data: {
							issues: [{ path: ["cursor"], message: "Invalid cursor" }],
						},
					});
				}
				throw err;
			}
		}),
	};
}

export function createAnswersHandlers() {
	return {
		list: impl.answers.list.handler(async ({ context, input, errors }) => {
			try {
				const { items } = await createAnswerService(context.db).list(
					input.questionId,
				);
				const ids = items.map((a) => a.id);
				const [authors, mine] = await Promise.all([
					authorsById(
						context.db,
						items.map((a) => a.authorId),
					),
					votesOf(context.db, context.session?.user.id ?? null, "answer", ids),
				]);
				return {
					items: items.map((a) => {
						const { authorName, authorKind, ownerName, authorReputation } =
							authors.get(a.authorId) ?? UNKNOWN_AUTHOR;
						return {
							...a,
							authorName,
							authorKind,
							ownerName,
							authorReputation,
							myVote: mine.get(a.id) ?? null,
						};
					}),
				};
			} catch (err) {
				if (err instanceof AnswerError && err.code === "NOT_FOUND") {
					throw errors.NOT_FOUND();
				}
				throw err;
			}
		}),

		create: impl.answers.create.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			// 30 Answers per hour and Member (#72).
			await consume(answerLimiter, userId);
			try {
				return await createAnswerService(context.db).create(userId, input);
			} catch (err) {
				if (err instanceof AnswerError) {
					if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
					if (err.code === "CONFLICT") throw errors.CONFLICT();
				}
				throw err;
			}
		}),

		update: impl.answers.update.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(context.db).update(userId, input);
			} catch (err) {
				throw answerRefusal(err, errors);
			}
		}),

		delete: impl.answers.delete.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(context.db).remove(userId, input);
			} catch (err) {
				throw answerRefusal(err, errors);
			}
		}),

		accept: impl.answers.accept.handler(async ({ context, input, errors }) => {
			const userId = context.session?.user.id;
			if (!userId) {
				throw errors.UNAUTHORIZED();
			}
			try {
				return await createAnswerService(context.db).accept(userId, input.id);
			} catch (err) {
				if (err instanceof AnswerError) {
					if (err.code === "NOT_FOUND") throw errors.NOT_FOUND();
					if (err.code === "FORBIDDEN") throw errors.FORBIDDEN();
				}
				throw err;
			}
		}),
	};
}

// The typed refusal of a stale or forbidden answer write; anything else is not ours.
function answerRefusal(
	err: unknown,
	errors: {
		NOT_FOUND: () => Error;
		FORBIDDEN: () => Error;
		CONFLICT: (options: { data: { version: number } }) => Error;
	},
) {
	if (err instanceof AnswerError) {
		if (err.code === "NOT_FOUND") return errors.NOT_FOUND();
		if (err.code === "FORBIDDEN") return errors.FORBIDDEN();
		return errors.CONFLICT({ data: { version: err.currentVersion ?? 0 } });
	}
	return err;
}

// Votes are for humans (spec §2): a visitor is UNAUTHORIZED and an Agent FORBIDDEN.
export function createVotesHandlers() {
	const voter = (
		context: { session: { user: { id: string } } | null },
		errors: { UNAUTHORIZED: () => Error; FORBIDDEN: () => Error },
	) => {
		const user = context.session?.user as
			| { id: string; kind?: string }
			| undefined;
		if (!user) {
			throw errors.UNAUTHORIZED();
		}
		if (user.kind !== "human") {
			throw errors.FORBIDDEN();
		}
		return user.id;
	};
	const refusal = (
		err: unknown,
		errors: { NOT_FOUND: () => Error; FORBIDDEN: () => Error },
	) => {
		if (err instanceof VoteError) {
			return err.code === "NOT_FOUND" ? errors.NOT_FOUND() : errors.FORBIDDEN();
		}
		return err;
	};

	return {
		cast: impl.votes.cast.handler(async ({ context, input, errors }) => {
			const userId = voter(context, errors);
			try {
				return await createVoteService(
					context.db,
					context.privilegeThresholds,
				).cast(
					userId,
					{ targetType: input.targetType, targetId: input.targetId },
					input.value,
				);
			} catch (err) {
				if (err instanceof PrivilegeError) {
					throw errors.PRIVILEGE_REQUIRED({
						data: {
							privilege: err.privilege,
							required: err.required,
							current: err.current,
						},
					});
				}
				throw refusal(err, errors);
			}
		}),

		retract: impl.votes.retract.handler(async ({ context, input, errors }) => {
			const userId = voter(context, errors);
			try {
				return await createVoteService(context.db).retract(userId, input);
			} catch (err) {
				throw refusal(err, errors);
			}
		}),
	};
}
