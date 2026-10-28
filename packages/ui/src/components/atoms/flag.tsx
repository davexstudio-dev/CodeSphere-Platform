import { cn } from "@codesphere/ui/lib/utils";
import { GlobeIcon } from "lucide-react";

type FlagProps = Omit<React.ComponentProps<"span">, "children"> & {
	/** ISO 3166-1 alpha-2 code, or `OTHER` for a country outside the list. */
	code: string;
	/** The country's name, spoken and shown on hover; the code when omitted. */
	name?: string;
	/** Where the flags are served from (`<base>/<CODE>.svg`). */
	base?: string;
};

/**
 * A country's flag, 3:2. Without the image (data saver mode switches it off, see globals.css, or
 * while it loads offline) the two-letter code takes its place, so the country is never lost. The
 * flag is a picture of the country, named for screen readers.
 */
function Flag({ code, name, base = "/flags", className, ...props }: FlagProps) {
	const upper = code.toUpperCase();
	const label = name ?? upper;
	return (
		<span
			data-slot="flag"
			role="img"
			aria-label={label}
			title={label}
			className={cn(
				"inline-flex shrink-0 items-center align-middle",
				className,
			)}
			{...props}
		>
			{upper === "OTHER" ? (
				<GlobeIcon aria-hidden className="size-3.5 text-muted-foreground" />
			) : (
				<>
					<img
						data-slot="flag-image"
						src={`${base}/${upper}.svg`}
						alt=""
						width={18}
						height={12}
						loading="lazy"
						decoding="async"
						className="h-3 w-4.5 rounded-xs object-cover ring-1 ring-border"
					/>
					<span
						data-slot="flag-code"
						aria-hidden
						className="hidden font-mono text-xs"
					>
						{upper}
					</span>
				</>
			)}
		</span>
	);
}

export { Flag, type FlagProps };
