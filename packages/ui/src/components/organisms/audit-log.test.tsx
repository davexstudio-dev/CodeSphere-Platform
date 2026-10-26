/// <reference types="bun" />
// The journal shows the reason an admin typed for a decision (#131 follow-up): the moderation
// dialog promises it is recorded, so it must be visible here.
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AuditLog } from "./audit-log";

const base = {
	id: "a1",
	at: "10 oct. 14:32",
	actor: "admin@codesphere",
	action: "Membre suspendu",
	target: "troll_account",
} as const;

describe("AuditLog", () => {
	test("shows the reason under the target", () => {
		const html = renderToStaticMarkup(
			<AuditLog entries={[{ ...base, reason: "Spam répété" }]} />,
		);
		expect(html).toContain("Raison : Spam répété");
	});

	test("has no Actions column unless the page can act on an entry", () => {
		const html = renderToStaticMarkup(<AuditLog entries={[base]} />);
		expect(html).not.toContain("Actions pour");
	});

	test("offers a menu per entry when actionsOf is given", () => {
		const html = renderToStaticMarkup(
			<AuditLog
				entries={[base]}
				actionsOf={() => [
					{ id: "detail", label: "Voir le détail", onSelect() {} },
				]}
			/>,
		);
		expect(html).toContain("Actions pour Membre suspendu · troll_account");
	});

	test("shows nothing extra for an entry without a reason", () => {
		const html = renderToStaticMarkup(<AuditLog entries={[base]} />);
		expect(html).not.toContain("Raison");
	});
});
