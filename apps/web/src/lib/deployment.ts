/**
 * Whether this build's deployment has a database. Read at build time (NEXT_PUBLIC_*): a build
 * made with `false` asks the API for nothing it cannot answer (#157). Every preview now has its
 * own Neon database, so it is built with `true`. Anything but "false" counts as a database, so staging and production need no
 * change.
 */
export function hasDatabaseFrom(value: string | undefined): boolean {
	return value !== "false";
}

export const HAS_DATABASE = hasDatabaseFrom(
	process.env.NEXT_PUBLIC_HAS_DATABASE,
);

/**
 * Whether /design-system (the component reference) is served. Read at build time (NEXT_PUBLIC_*):
 * only an explicit `false` closes it, so dev, previews and staging keep it. The production image
 * is built with `false` (apps/web/Dockerfile, docker-compose.prod.yml, production.yml): the page
 * is an internal reference, not a public one.
 */
export function designSystemEnabledFrom(value: string | undefined): boolean {
	return value !== "false";
}

export const DESIGN_SYSTEM_ENABLED = designSystemEnabledFrom(
	process.env.NEXT_PUBLIC_DESIGN_SYSTEM,
);
