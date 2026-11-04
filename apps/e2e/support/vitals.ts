import pg from "pg";

/** The number of Web Vitals reports counted for `metric`, all countries and days (#251). */
export async function vitalSamples(metric: string): Promise<number> {
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query(
			"select coalesce(sum(samples), 0)::int as n from web_vitals where metric = $1",
			[metric],
		);
		return rows[0].n;
	} finally {
		await client.end();
	}
}
