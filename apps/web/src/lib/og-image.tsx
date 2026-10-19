import { ImageResponse } from "next/og";

import { BRAND } from "@/lib/brand";
import { type CardInput, cardText, OG_SIZE } from "@/lib/og-card";
import { publicPageUrl } from "@/lib/page-url";
import { OG_IMAGE_PATH, SITE_NAME } from "@/lib/share";

/** A found card is cached longer than the generic one served while the content cannot be read. */
const FOUND_CACHE = "public, max-age=300, s-maxage=3600";
const GENERIC_CACHE = "public, max-age=60, s-maxage=300";

/**
 * The share card of a public page (#262): title, Tags and score on the brand colours. Without a
 * `card` (content unknown, deleted or unreadable) it is the generic card: no leak, and a crawler
 * still gets an image rather than an error.
 */
function draw(card: CardInput | null) {
	const text = cardText(card ?? { title: SITE_NAME });
	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: 72,
				background: BRAND.background,
				color: "#2b211b",
			}}
		>
			<div style={{ display: "flex", fontSize: 32, color: BRAND.primary }}>
				{SITE_NAME}
			</div>
			<div style={{ display: "flex", flexDirection: "column" }}>
				<div
					style={{
						display: "flex",
						fontSize: 68,
						lineHeight: 1.15,
						wordBreak: "break-word",
						overflow: "hidden",
					}}
				>
					{text.title}
				</div>
				{text.subtitle ? (
					<div style={{ display: "flex", fontSize: 34, marginTop: 24 }}>
						{text.subtitle}
					</div>
				) : null}
			</div>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<div
					style={{
						display: "flex",
						flexWrap: "wrap",
						flex: 1,
						marginRight: 24,
					}}
				>
					{text.tags.map((tag, index) => (
						<div
							key={index}
							style={{
								display: "flex",
								fontSize: 28,
								marginRight: 16,
								padding: "8px 20px",
								borderRadius: 999,
								background: BRAND.primary,
								color: BRAND.background,
							}}
						>
							{tag}
						</div>
					))}
				</div>
				{text.score ? (
					<div style={{ display: "flex", fontSize: 44, color: BRAND.primary }}>
						{text.score}
					</div>
				) : null}
			</div>
		</div>,
		{
			...OG_SIZE,
			headers: { "Cache-Control": card ? FOUND_CACHE : GENERIC_CACHE },
		},
	);
}

/**
 * `draw`, rendered now rather than while the response is piped: where next/og cannot rasterize
 * (the repo stubs sharp with an empty package, which next/og's Node build then mistakes for the
 * real one; the Worker build uses resvg and is unaffected), the answer is the bytes of the static
 * card, not a broken stream and not a redirect (unfurlers do not all follow one on an image).
 */
export async function renderCard(card: CardInput | null) {
	try {
		const image = draw(card);
		return new Response(await image.arrayBuffer(), {
			status: 200,
			headers: image.headers,
		});
	} catch {
		const fallback = await fetch(await publicPageUrl(OG_IMAGE_PATH));
		return new Response(fallback.body, {
			status: fallback.status,
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": GENERIC_CACHE,
			},
		});
	}
}

/** The card cannot be built because the content could not be read, not because it is unknown. */
export function unavailable() {
	return new Response(null, {
		status: 503,
		headers: { "Retry-After": "60", "Cache-Control": "no-store" },
	});
}
