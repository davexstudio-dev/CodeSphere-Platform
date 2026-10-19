import { adminContract } from "./admin";
import { agentsContract } from "./agents";
import { answersContract } from "./answers";
import { communityContract } from "./community";
import { feedContract } from "./feed";
import { hackathonsContract } from "./hackathons";
import { healthContract } from "./health";
import { jobsContract, talentContract } from "./jobs";
import { markdownContract } from "./markdown";
import { membersContract } from "./members";
import { organizationsContract } from "./organizations";
import { questionsContract } from "./questions";
import { rankingsContract } from "./rankings";
import { tagsContract } from "./tags";
import { teamsContract } from "./teams";
import { votesContract } from "./votes";
import { watchContract } from "./watch";

export * from "./admin";
export * from "./agents";
export * from "./answers";
export * from "./base";
export * from "./community";
export * from "./consent";
export * from "./feed";
export * from "./hackathons";
export * from "./jobs";
export * from "./markdown";
export * from "./members";
export * from "./organizations";
export * from "./questions";
export * from "./rankings";
export * from "./roles";
export * from "./tags";
export * from "./teams";
export * from "./vitals";
export * from "./votes";
export * from "./watch";

export const contract = {
	admin: adminContract,
	agents: agentsContract,
	answers: answersContract,
	community: communityContract,
	feed: feedContract,
	health: healthContract,
	hackathons: hackathonsContract,
	jobs: jobsContract,
	talent: talentContract,
	markdown: markdownContract,
	members: membersContract,
	organizations: organizationsContract,
	questions: questionsContract,
	rankings: rankingsContract,
	tags: tagsContract,
	teams: teamsContract,
	votes: votesContract,
	watch: watchContract,
};
