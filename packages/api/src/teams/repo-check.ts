// The automatic check of a Submission's repository (#261): a repository whose first commit is older
// than the Hackathon's opening is flagged for an Admin. Only GitHub repositories can be read.

/** The date of the first commit of a repository, or null when it cannot be told. */
export type RepoCheck = (repoUrl: string) => Promise<Date | null>;

/** `https://github.com/owner/repo(.git)(/...)` -> `{ owner, repo }`, else null. */
export function githubRepoOf(
	url: string,
): { owner: string; repo: string } | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "github.com") {
			return null;
		}
		const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
		if (!owner || !repo) {
			return null;
		}
		return { owner, repo: repo.replace(/\.git$/i, "") };
	} catch {
		return null;
	}
}

const FETCH_TIMEOUT_MS = 8000;

/**
 * The GitHub REST API, unauthenticated (60 requests an hour) or with `token`: the oldest commit is
 * on the last page of the commit list, which the `Link` header names.
 */
export function githubFirstCommit(
	token?: string,
	fetcher: typeof fetch = fetch,
): RepoCheck {
	const headers: Record<string, string> = {
		accept: "application/vnd.github+json",
		"user-agent": "CodeSphereBot/1.0",
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
	const get = (url: string) =>
		fetcher(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	return async (repoUrl) => {
		const repo = githubRepoOf(repoUrl);
		if (!repo) {
			return null;
		}
		const base = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/commits?per_page=1`;
		const first = await get(base);
		if (!first.ok) {
			return null;
		}
		const last = /<([^>]+)>;\s*rel="last"/.exec(
			first.headers.get("link") ?? "",
		)?.[1];
		const page = last ? await get(last) : first;
		if (!page.ok) {
			return null;
		}
		const commits = (await page.json()) as {
			commit?: { author?: { date?: string }; committer?: { date?: string } };
		}[];
		const date =
			commits.at(-1)?.commit?.author?.date ??
			commits.at(-1)?.commit?.committer?.date;
		const parsed = date ? new Date(date) : null;
		return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
	};
}
