import { cn } from "@codesphere/ui/lib/utils";

const SIZES = {
	sm: "size-9 text-xs",
	md: "size-12 text-sm",
	lg: "size-14 text-lg",
	xl: "size-16 text-xl",
} as const;

/** The first letters of a name (two at most), « ? » for an empty one. */
export const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("") || "?";

type InitialsAvatarProps = Omit<React.ComponentProps<"span">, "children"> & {
	name: string;
	size?: keyof typeof SIZES;
	/** A ring around the disc, as on the badges of the site header and the back-office. */
	ringed?: boolean;
};

/**
 * The member's initials on the brand gradient: the account badge of the site and the back-office,
 * the identity cards of the settings, « Mon compte » and the team. Decorative: the name is always
 * written next to it or in the button's label.
 */
function InitialsAvatar({
	name,
	size = "sm",
	ringed = false,
	className,
	...props
}: InitialsAvatarProps) {
	return (
		<span
			aria-hidden="true"
			data-slot="initials-avatar"
			className={cn(
				"grid shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-gold font-bold text-primary-foreground",
				SIZES[size],
				ringed && "ring-2 ring-background ring-offset-1 ring-offset-primary",
				className,
			)}
			{...props}
		>
			{initialsOf(name)}
		</span>
	);
}

type AvatarButtonProps = React.ComponentProps<"button"> & { name: string };

/** A round button showing the initials: the trigger of the site's account menu. */
function AvatarButton({ name, className, ...props }: AvatarButtonProps) {
	return (
		<button
			type="button"
			data-slot="avatar-button"
			className={cn(
				"rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				className,
			)}
			{...props}
		>
			<InitialsAvatar name={name} ringed />
		</button>
	);
}

export { AvatarButton, InitialsAvatar, type InitialsAvatarProps };
