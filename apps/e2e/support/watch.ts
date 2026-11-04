import pg from "pg";

/** Inserts a visible watch item from a trusted Source (#255) and returns the Source's id. */
export async function seedWatchItem(item: {
	title: string;
	url: string;
	sourceName: string;
}): Promise<void> {
	const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
	await client.connect();
	try {
		const { rows } = await client.query(
			`insert into watch_sources (name, feed_url, domain, language, african, tags)
			 values ($1, $2, 'e2e-watch.example.com', 'fr', true, '{web}')
			 on conflict (feed_url) do update set name = excluded.name
			 returning id`,
			[item.sourceName, `https://e2e-watch.example.com/${item.sourceName}.xml`],
		);
		await client.query(
			`insert into watch_items (url, url_key, domain, title, summary, tags, language, african_source, source_id, visibility, published_at)
			 values ($1, $1, 'e2e-watch.example.com', $2, 'Un résumé court.', '{web}', 'fr', true, $3, 'visible', now())
			 on conflict (url_key) do nothing`,
			[item.url, item.title, rows[0].id],
		);
	} finally {
		await client.end();
	}
}
