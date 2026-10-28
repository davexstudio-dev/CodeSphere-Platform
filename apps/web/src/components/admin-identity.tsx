"use client";

import { createContext, useContext } from "react";

export type AdminIdentity = {
	id: string;
	name: string;
	email: string;
	role: string;
	/** ISO date the account was created. */
	createdAt: string;
	emailVerified: boolean;
};

const AdminIdentityContext = createContext<AdminIdentity | null>(null);

/** The signed-in Admin, read once by the (admin) layout on the server and shared with the pages. */
export function AdminIdentityProvider({
	identity,
	children,
}: {
	identity: AdminIdentity;
	children: React.ReactNode;
}) {
	return (
		<AdminIdentityContext.Provider value={identity}>
			{children}
		</AdminIdentityContext.Provider>
	);
}

export function useAdminIdentity() {
	return useContext(AdminIdentityContext);
}
