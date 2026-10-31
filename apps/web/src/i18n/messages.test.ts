/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { createTranslator } from "next-intl";

import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): string[] {
	return Object.entries(tree).flatMap(([key, value]) =>
		typeof value === "string"
			? [`${prefix}${key}`]
			: leaves(value, `${prefix}${key}.`),
	);
}

function valueAt(tree: Tree, key: string): string {
	return key
		.split(".")
		.reduce<string | Tree>(
			(node, part) => (node as Tree)[part] ?? "",
			tree,
		) as string;
}

describe("messages", () => {
	// next-intl reads a dot as nesting and refuses such a key, on every page.
	test("no key holds a dot", () => {
		const dotted = (tree: Tree): string[] =>
			Object.entries(tree).flatMap(([key, value]) => [
				...(key.includes(".") ? [key] : []),
				...(typeof value === "string" ? [] : dotted(value)),
			]);
		expect(dotted(en as Tree)).toEqual([]);
		expect(dotted(fr as Tree)).toEqual([]);
	});

	// The Activity tab builds its key from the audit action: `actions.${action}`.
	test("an audit action of an Agent resolves to its label", () => {
		const t = createTranslator({
			locale: "fr",
			messages: fr,
			namespace: "agentActivity",
		});
		expect(t("actions.agent.key.create")).toBe("Clé créée");
		expect(t("actions.agent.reactivate")).toBe("Réactivé par l'équipe");
	});

	test("French and English have the same keys", () => {
		expect(leaves(en as Tree).sort()).toEqual(leaves(fr as Tree).sort());
	});

	// The app uses no rich text: a `<word>` would be read as an ICU tag and the page would show
	// the raw key instead of the message.
	test("no message carries an ICU tag", () => {
		const tagged = [en, fr].flatMap((messages) =>
			leaves(messages as Tree).filter((key) =>
				/<\/?[\p{L}]/u.test(valueAt(messages as Tree, key)),
			),
		);
		expect(tagged).toEqual([]);
	});
});
