/**
 * An address-safe form of a name: lowercase letters, digits and single hyphens, accents removed.
 * « Société Générale d'Afrique » -> `societe-generale-d-afrique`. The SQL of the #257 migration
 * computes the same form for the names it migrates.
 */
export function slugify(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
