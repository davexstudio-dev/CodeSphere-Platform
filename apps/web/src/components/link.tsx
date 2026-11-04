"use client";

import { useDataSaver } from "@codesphere/ui/lib/data-saver";
import NextLink, { type LinkProps } from "next/link";
import type * as React from "react";

type Props<RouteType> = LinkProps<RouteType> &
	Omit<
		React.AnchorHTMLAttributes<HTMLAnchorElement>,
		keyof LinkProps<RouteType>
	> & {
		children?: React.ReactNode;
		ref?: React.Ref<HTMLAnchorElement>;
	};

/**
 * `next/link`, which in data saver mode (#250) does not prefetch the pages its links point to. Every
 * link of the app comes from here (and the UI package gets it as its `LinkComponent`). Generic in
 * the route type, so typed routes keep checking `href`.
 */
export default function Link<RouteType>(props: Props<RouteType>) {
	const dataSaver = useDataSaver();
	return <NextLink {...props} prefetch={dataSaver ? false : props.prefetch} />;
}
