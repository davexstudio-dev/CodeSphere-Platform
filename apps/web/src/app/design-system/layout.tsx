import { notFound } from "next/navigation";

import { DESIGN_SYSTEM_ENABLED } from "@/lib/deployment";

// The page itself is a client component: this layout is where the route is closed. The production
// build answers 404 (NEXT_PUBLIC_DESIGN_SYSTEM=false), every other deployment keeps the reference.
export default function DesignSystemLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	if (!DESIGN_SYSTEM_ENABLED) {
		notFound();
	}
	return children;
}
