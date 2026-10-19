import { JoinTeam } from "@/components/hackathon/join-team";

// The page of a Team's invitation link (#261): the signed-in Member joins, then lands on the Hackathon.
export default async function Page({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	return <JoinTeam token={token} />;
}
