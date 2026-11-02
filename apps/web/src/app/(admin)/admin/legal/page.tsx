import { LEGAL_DOCUMENTS } from "@codesphere/contract";

import AdminLegalEditor, {
	type RepositoryTexts,
} from "@/components/admin-legal-editor";
import { repositoryMarkdown } from "@/lib/legal";

// The first draft of a document is the text of the repository (#341): both languages are read here,
// on the server, so the JSON files do not travel to the browser.
export default async function AdminLegalPage() {
	const [fr, en] = await Promise.all([
		import("../../../../../messages/fr.json"),
		import("../../../../../messages/en.json"),
	]);
	const repository = Object.fromEntries(
		LEGAL_DOCUMENTS.map((document) => [
			document,
			{
				fr: repositoryMarkdown(document, fr.default),
				en: repositoryMarkdown(document, en.default),
			},
		]),
	) as RepositoryTexts;
	return <AdminLegalEditor repository={repository} />;
}
