/**
 * The id of a Member as typed in the invitation form (#326): the id itself, or the address of their
 * profile (`https://…/members/<id>`), of which only the last segment counts. Empty when there is
 * nothing usable.
 */
export function memberIdFrom(text: string): string {
	const trimmed = text
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "");
	const last = trimmed.split("/").pop() ?? "";
	return /^[\w-]{1,128}$/.test(last) ? last : "";
}
