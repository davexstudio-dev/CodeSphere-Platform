"use client";

import { type Permissions, roleCan } from "@codesphere/auth/access";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@codesphere/ui/components/molecules/empty";
import { AdminShell } from "@codesphere/ui/components/organisms/admin-shell";
import {
	BarChart3Icon,
	BriefcaseIcon,
	BuildingIcon,
	GaugeIcon,
	RssIcon,
	ScaleIcon,
	ScrollTextIcon,
	ShareIcon,
	ShieldIcon,
	TagIcon,
	TrophyIcon,
	UsersIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import AdminAccountMenu from "@/components/admin-account-menu";
import { useAdminIdentity } from "@/components/admin-identity";
import Link from "@/components/link";

// Each screen with the permission its procedures require (#285): the same access control the API
// enforces, so a moderator sees only what they can use.
const NAV: {
	group: "pilot" | "content" | "community" | "team";
	key: string;
	href: string;
	icon: typeof ShieldIcon;
	can: Permissions;
}[] = [
	{
		group: "pilot",
		key: "dashboard.title",
		href: "/dashboard",
		icon: BarChart3Icon,
		can: { kpi: ["read"] },
	},
	{
		group: "pilot",
		key: "vitals.title",
		href: "/admin/vitals",
		icon: GaugeIcon,
		can: { kpi: ["read"] },
	},
	{
		group: "pilot",
		key: "reputation.title",
		href: "/admin/reputation",
		icon: ScaleIcon,
		can: { moderation: ["list"] },
	},
	{
		group: "pilot",
		key: "audit.title",
		href: "/admin/audit",
		icon: ScrollTextIcon,
		can: { audit: ["read"] },
	},
	{
		group: "content",
		key: "moderation.title",
		href: "/admin",
		icon: ShieldIcon,
		can: { moderation: ["list"] },
	},
	{
		group: "content",
		key: "tags.title",
		href: "/admin/tags",
		icon: TagIcon,
		can: { tag: ["list"] },
	},
	{
		group: "content",
		key: "watch.title",
		href: "/admin/watch",
		icon: RssIcon,
		can: { watch: ["manage"] },
	},
	{
		group: "community",
		key: "hackathons.title",
		href: "/admin/hackathons",
		icon: TrophyIcon,
		can: { hackathon: ["update"] },
	},
	{
		group: "community",
		key: "organizations.title",
		href: "/admin/organizations",
		icon: BuildingIcon,
		can: { organization: ["manage"] },
	},
	{
		group: "community",
		key: "jobs.title",
		href: "/admin/jobs",
		icon: BriefcaseIcon,
		can: { job: ["manage"] },
	},
	{
		group: "team",
		key: "staff.title",
		href: "/admin/staff",
		icon: UsersIcon,
		can: { staff: ["list"] },
	},
	{
		group: "team",
		key: "social.title",
		href: "/admin/social",
		icon: ShareIcon,
		can: { social: ["manage"] },
	},
];

export { NAV as ADMIN_NAV };

/** The screen `pathname` belongs to: the longest matching entry, so /admin/tags is not /admin. */
const screenOf = (pathname: string) =>
	// « Mon compte » belongs to every staff member: no permission to ask for.
	(pathname.startsWith("/admin/account") ? [] : NAV)
		.filter(
			(item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
		)
		.sort((a, b) => b.href.length - a.href.length)[0];

/** The back-office layout with the navigation wired to the router and the signed-in Admin. */
export default function AdminFrame({
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	const pathname = usePathname();
	const identity = useAdminIdentity();
	const t = useTranslations("admin");
	// A screen the role cannot use shows why instead of a page of FORBIDDEN errors.
	const screen = screenOf(pathname);
	const allowed = !screen || roleCan(identity?.role, screen.can);

	return (
		<AdminShell
			title={title}
			description={description}
			LinkComponent={Link}
			userMenu={({ collapsed }) => <AdminAccountMenu compact={collapsed} />}
			nav={NAV.filter((item) => roleCan(identity?.role, item.can)).map(
				({ key, can: _can, group, ...item }) => ({
					...item,
					group: t(`navGroups.${group}`),
					label: t(key),
					active: pathname === item.href,
				}),
			)}
			actions={actions}
			menuLabel={t("navGroups.menu")}
		>
			{allowed ? (
				children
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{t("forbidden.title")}</EmptyTitle>
						<EmptyDescription>{t("forbidden.text")}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</AdminShell>
	);
}
