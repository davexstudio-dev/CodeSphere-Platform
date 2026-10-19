// Rules of an Organization's application (#257): its contact address must be on its own domain.

/** Public mailboxes: an address there proves nothing about who runs the Organization. */
const FREE_MAIL = new Set([
	"gmail.com",
	"googlemail.com",
	"yahoo.com",
	"yahoo.fr",
	"hotmail.com",
	"hotmail.fr",
	"outlook.com",
	"outlook.fr",
	"live.com",
	"live.fr",
	"msn.com",
	"icloud.com",
	"me.com",
	"aol.com",
	"gmx.com",
	"proton.me",
	"protonmail.com",
	"yandex.com",
	"mail.com",
	"zoho.com",
]);

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The domain of an email address, lowercase; empty when there is none. */
export const emailDomain = (email: string) =>
	bare(email.slice(email.lastIndexOf("@") + 1));

/**
 * Whether `email` is on the website's own domain: the same host, or a subdomain of it
 * (`jobs@mail.example.org` for `https://www.example.org`), and not a public mailbox.
 */
export function emailMatchesWebsite(email: string, website: string): boolean {
	let host: string;
	try {
		host = bare(new URL(website).hostname);
	} catch {
		return false;
	}
	const domain = emailDomain(email);
	if (!domain || FREE_MAIL.has(domain) || FREE_MAIL.has(host)) {
		return false;
	}
	return domain === host || domain.endsWith(`.${host}`);
}
