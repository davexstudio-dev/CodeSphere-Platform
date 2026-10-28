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
};

function ProviderButton({
	provider,
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
			className={cn("w-full justify-center", className)}
			{...props}
		>
			<Icon className="size-4" />
			Continuer avec {label}
		</Button>
	);
}

export { ProviderButton, type ProviderButtonProps, type SsoProvider };
