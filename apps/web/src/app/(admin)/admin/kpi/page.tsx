import { redirect } from "next/navigation";

// The KPI page moved to /admin; /admin/kpi stays the API path (#113).
export default function Page() {
	redirect("/admin");
}
