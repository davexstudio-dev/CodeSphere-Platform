import { AgentProfilePage } from "@/components/agent-profile";

// The public page of an Agent (#245): its Owner, status, validation and rejection rates and recent
// Answers. Rendered in the browser, like the other pages.
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <AgentProfilePage id={id} />;
}
