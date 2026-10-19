import {
	boolean,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Tags a Member follows (#65): they scope the For You feed. `tag` is the normalized form (trimmed,
// lowercase), the same one stored in `questions.tags`. Following and unfollowing is owned by #44.
export const tagFollows = pgTable(
	"tag_follows",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tag: text("tag").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

// The official Tags an Admin curates (#125). `name` is the normalized form (trimmed, lowercase),
// the same one stored in `questions.tags`; it is unique, so a rename that collides is CONFLICT.
// A Tag named like a Hackathon's slug belongs to that Hackathon and is protected.
export const tag = pgTable("tag", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull().unique(),
	version: integer("version").default(1).notNull(),
	// Reserved by an Admin: kept as is, never renamed nor deleted, even when no Question uses it.
	reserved: boolean("reserved").default(false).notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
