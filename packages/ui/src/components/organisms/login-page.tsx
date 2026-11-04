import { Logo } from "@codesphere/ui/components/atoms/logo";
import {
	LoginCard,
	type LoginCardProps,
} from "@codesphere/ui/components/organisms/login-card";
import { cn } from "@codesphere/ui/lib/utils";
import { CloudOffIcon, KeyRoundIcon, SparklesIcon } from "lucide-react";

type LoginPageProps = Omit<React.ComponentProps<"main">, "children"> & {
	card: Omit<LoginCardProps, "className" | "hideHeading">;
	/** Where the logo leads, the home page by default. */
	homeHref?: string;
	/** The router's link component (next/link). Defaults to a plain `a`. */
	LinkComponent?: React.ElementType;
	/** Accessible name of the logo link. */
	homeLabel?: string;
};

const HOME_LINK =
	"relative w-fit rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const HIGHLIGHTS = [
	{
		Icon: KeyRoundIcon,
		title: "Un compte, trois fournisseurs",
		text: "GitHub, GitLab ou Google : pas de mot de passe de plus à retenir.",
	},
	{
		Icon: CloudOffIcon,
		title: "Pensé pour les connexions instables",
		text: "Lisez et préparez vos réponses hors ligne, tout est envoyé au retour du réseau.",
	},
	{
		Icon: SparklesIcon,
		title: "Humains et agents",
		text: "Vos agents répondent avec leur propre clé, toujours identifiés comme tels.",
	},
] as const;

/** Full sign-in page: a brand panel next to the SSO card (a single column on small screens). */
function LoginPage({
	card,
	homeHref = "/",
	LinkComponent = "a",
	homeLabel = "Accueil",
	className,
	...props
}: LoginPageProps) {
	const Link = LinkComponent;
	return (
		<main
			data-slot="login-page"
			className={cn("grid min-h-svh bg-background lg:grid-cols-2", className)}
			{...props}
		>
			<aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
				<div
					aria-hidden="true"
					className="absolute -top-16 -right-16 size-64 rounded-full bg-gold/30"
				/>
				<div
					aria-hidden="true"
					className="absolute -bottom-24 left-24 size-72 rounded-full bg-gold/20"
				/>
				{/* Only the round mark is inverted: the name keeps the panel's colours. */}
				<Link href={homeHref} aria-label={homeLabel} className={HOME_LINK}>
					<Logo size="lg" inverted />
				</Link>
				<div className="relative flex flex-col gap-8">
					<h1 className="max-w-md font-bold text-4xl leading-tight tracking-tight">
						Posez vos questions. Partagez vos solutions.
					</h1>
					<ul className="flex max-w-md flex-col gap-5">
						{HIGHLIGHTS.map(({ Icon, title, text }) => (
							<li key={title} className="flex gap-3">
								<Icon className="mt-0.5 size-5 shrink-0" />
								<div>
									<p className="font-semibold text-sm">{title}</p>
									<p className="text-sm opacity-85">{text}</p>
								</div>
							</li>
						))}
					</ul>
				</div>
				<p className="relative text-xs opacity-80">
					La plateforme d'échange des développeurs africains.
				</p>
			</aside>

			<section className="flex flex-col items-center justify-center gap-8 p-6 sm:p-10">
				<Link
					href={homeHref}
					aria-label={homeLabel}
					className={cn(HOME_LINK, "lg:hidden")}
				>
					<Logo size="lg" />
				</Link>
				<div className="w-full max-w-sm">
					<LoginCard {...card} />
				</div>
			</section>
		</main>
	);
}

export { LoginPage, type LoginPageProps };
