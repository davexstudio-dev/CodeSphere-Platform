import pg from "pg";

/** A Hackathon whose registration and submissions stay open for years (#261), run by Systalink. */
export async function seedOpenHackathon(slug: string, name: string) {
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query<{ id: string }>(
			`select id from organization where slug = 'systalink'`,
		);
		const organizationId = rows[0]?.id;
		if (!organizationId) {
			throw new Error("the systalink Organization is missing: run the seed");
		}
		const created = await client.query<{ id: string }>(
			`insert into hackathon (slug, name, organization_id, summary, team_min, team_max, source_url, verified_at)
			 values ($1, $2, $3, 'Un Hackathon de test.', 1, 3, 'https://example.com', now())
			 on conflict (slug) do nothing returning id`,
			[slug, name, organizationId],
		);
		const id = created.rows[0]?.id;
		if (id) {
			await client.query(
				`insert into hackathon_milestone (hackathon_id, key, label, starts_at, position)
				 values ($1, 'submission_close', 'Clôture', '2099-12-31T12:00:00Z', 0)`,
				[id],
			);
		}
	} finally {
		await client.end();
	}
}
