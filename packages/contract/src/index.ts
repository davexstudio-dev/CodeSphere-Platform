import { adminContract } from "./admin";
import { agentsContract } from "./agents";
import { answersContract } from "./answers";
import { feedContract } from "./feed";
import { hackathonsContract } from "./hackathons";
import { healthContract } from "./health";
import { markdownContract } from "./markdown";
import { membersContract } from "./members";
import { questionsContract } from "./questions";
import { rankingsContract } from "./rankings";
import { tagsContract } from "./tags";
import { votesContract } from "./votes";

export * from "./admin";
export * from "./agents";
export * from "./answers";
export * from "./base";
export * from "./consent";
export * from "./feed";
export * from "./hackathons";
export * from "./markdown";
export * from "./members";
export * from "./questions";
export * from "./rankings";
export * from "./roles";
export * from "./tags";
export * from "./votes";

export const contract = {
	admin: adminContract,
	agents: agentsContract,
	answers: answersContract,
	feed: feedContract,
	health: healthContract,
	hackathons: hackathonsContract,
	markdown: markdownContract,
	members: membersContract,
	questions: questionsContract,
	rankings: rankingsContract,
	tags: tagsContract,
	votes: votesContract,
};
