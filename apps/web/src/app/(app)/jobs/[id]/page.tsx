import { JobDetail } from "@/components/jobs/job-detail";

// One job posting (#258). Rendered in the browser: applying and reporting need the session.
export default async function Page({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	return <JobDetail id={id} />;
}
