import { redirect } from "next/navigation";

// The dashboard moved to /admin: every back-office screen lives under /admin.
export default function Page() {
	redirect("/admin");
}
