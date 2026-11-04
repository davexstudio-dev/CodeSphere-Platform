"use client";

import { cn } from "@codesphere/ui/lib/utils";
import { useEffect, useState } from "react";

type AdminMasterDetailProps = Omit<React.ComponentProps<"div">, "children"> & {
	/** The list, usually a `GroupedList`: fixed on the left, it scrolls on its own. */
	list: React.ReactNode;
	/** The selected record, usually a `RecordSheet`. */
	detail: React.ReactNode;
	/** Identifies the record in `detail`: when it changes, the new record slides in (panel reveal). */
	detailKey?: React.Key | null;
};

/** Panel reveal (transitions.dev 07): remounted per record, it rises into place once painted. */
function RevealedDetail({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const frame = requestAnimationFrame(() => setOpen(true));
		return () => cancelAnimationFrame(frame);
	}, []);
	return (
		<div className="t-panel-slide" data-open={open}>
			{children}
		</div>
	);
}

/**
 * The admin list/detail layout (#117): the list stays put on the left (sticky, under the fixed
 * page header) while the record scrolls on the right. They stack when the content area is
 * narrower than 736 px: a container query, not a viewport one, because the sidebar takes 16 rem
 * of a tablet's width.
 */
function AdminMasterDetail({
	list,
	detail,
	detailKey,
	className,
	...props
}: AdminMasterDetailProps) {
	return (
		<div data-slot="admin-master-detail" className="@container w-full min-w-0">
			<div
				className={cn(
					"flex @min-[46rem]:grid @min-[46rem]:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] flex-col @min-[46rem]:items-start gap-6",
					className,
				)}
				{...props}
			>
				<div className="@min-[46rem]:sticky @min-[46rem]:top-28 flex @min-[46rem]:max-h-[calc(100svh-8rem)] flex-col">
					{list}
				</div>
				<div className="min-w-0">
					{detailKey == null ? (
						detail
					) : (
						<RevealedDetail key={detailKey}>{detail}</RevealedDetail>
					)}
				</div>
			</div>
		</div>
	);
}

export { AdminMasterDetail, type AdminMasterDetailProps };
