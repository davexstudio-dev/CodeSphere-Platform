import { isStaffRole } from "@codesphere/contract/roles";
import { redirect } from "next/navigation";

import { AdminIdentityProvider } from "@/components/admin-identity";
import { getServerSession } from "@/lib/server-session";

// Guard of every /admin page (#120): no session → /signin, a non-Admin → home. The API stays
// the real gate (FORBIDDEN on every admin procedure); this only keeps the screens private.
export default async function AdminLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getServerSession();
	if (!session?.user) {
		redirect("/signin");
	}
	if (!isStaffRole(session.user.role)) {
		redirect("/");
	}
	return (
		<AdminIdentityProvider
			identity={{
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
				role: session.user.role ?? "member",
				createdAt: new Date(session.user.createdAt).toISOString(),
				emailVerified: session.user.emailVerified,
			}}
		>
			{children}
		</AdminIdentityProvider>
	);
}
