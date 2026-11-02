import { OrganizationManage } from "@/components/organizations/organization-manage";

type Params = { params: Promise<{ slug: string }> };

// The space of an Organization's team (#326). Rendered in the browser: it needs the Member's session.
export default async function Page({ params }: Params) {
	const { slug } = await params;
	return <OrganizationManage slug={slug} />;
}
