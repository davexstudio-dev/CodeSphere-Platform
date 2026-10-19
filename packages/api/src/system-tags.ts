/**
 * Tags the product itself relies on (the roadmap's idea box asks its Questions under `roadmap`):
 * always reserved, and an Admin cannot lift the reservation. The migration creates them reserved,
 * and every path that creates a Tag does so too, so the invariant does not rest on one migration.
 */
export const SYSTEM_TAGS = ["roadmap"] as const;

export const isSystemTag = (name: string) =>
	(SYSTEM_TAGS as readonly string[]).includes(name);
