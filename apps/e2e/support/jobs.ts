import pg from "pg";

/** Makes the Member with `email` the owner of a validated Organization (#258), straight in the database. */
export async function seedValidatedOrganization(
	email: string,
	slug: string,
	name: string,
) {
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query<{ id: string }>(
			`select id from "user" where email = $1`,
			[email],
		);
		const ownerId = rows[0]?.id;
		if (!ownerId) {
			throw new Error(`no Member with email ${email}`);
		}
		await client.query(
			`insert into organization (slug, name, website, country, status, owner_id, validated_at, reviewed_at)
			 values ($1, $2, 'https://e2e-jobs.example.org', 'SN', 'validated', $3, now(), now())
			 on conflict (slug) do nothing`,
			[slug, name, ownerId],
		);
	} finally {
		await client.end();
	}
}
