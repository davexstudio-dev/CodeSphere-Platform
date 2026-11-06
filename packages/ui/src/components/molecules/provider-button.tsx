import { Badge } from "@codesphere/ui/components/atoms/badge";
import {
	GithubMark,
	GitlabMark,
	GoogleMark,
} from "@codesphere/ui/components/atoms/brand-icons";
import { Button } from "@codesphere/ui/components/atoms/button";
import { cn } from "@codesphere/ui/lib/utils";

type SsoProvider = "github" | "gitlab" | "google";

const PROVIDERS: Record<
	SsoProvider,
	{
		label: string;
		Icon: (props: React.ComponentProps<"svg">) => React.ReactElement;
	}
> = {
	github: { label: "GitHub", Icon: GithubMark },
	gitlab: { label: "GitLab", Icon: GitlabMark },
	google: { label: "Google", Icon: GoogleMark },
};

type ProviderButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"children"
> & {
	provider: SsoProvider;
	/** The Member signed in with this provider last time: says so on the button. */
	lastUsed?: boolean;
};

function ProviderButton({
	provider,
	lastUsed = false,
	className,
	...props
}: ProviderButtonProps) {
	const { label, Icon } = PROVIDERS[provider];
	return (
		<Button
			type="button"
			variant="outline"
			size="lg"
			data-slot="provider-button"
			data-provider={provider}
			data-last-used={lastUsed || undefined}
			className={cn(
				"relative w-full justify-center",
				lastUsed && "border-primary/60",
				className,
			)}
			{...props}
		>
			<Icon className="size-4" />
			Continuer avec {label}
			{lastUsed && (
				<Badge variant="secondary" className="absolute right-3">
					Dernière utilisée
				</Badge>
			)}
		</Button>
	);
}

export { ProviderButton, type ProviderButtonProps, type SsoProvider };
