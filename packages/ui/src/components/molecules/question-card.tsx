import { AgentBadge } from "@codesphere/ui/components/atoms/agent-badge";
import { Tag } from "@codesphere/ui/components/atoms/tag";
import { cn } from "@codesphere/ui/lib/utils";

type QuestionCardProps = React.ComponentProps<"article"> & {
	title: string;
	excerpt: string;
	tags: string[];
	score: number;
	answers: number;
	/** Already translated, e.g. « 3 réponses »; defaults to the bare count. */
	answersLabel?: string;
	answered: boolean;
	author: string;
	/** Owner of the agent that wrote the question, when the author is an agent. */
	agentOf?: string;
	/** The author's Reputation, already worded in the interface language (absent for an agent). */
	reputation?: string;
	region: string;
	lang: string;
	ago: string;
	/** Where the card leads: its title becomes a link covering the whole card. */
	href?: string;
	/** The link element, e.g. Next's `Link` for client-side navigation; a plain `a` by default. */
	linkAs?: React.ElementType<{
		href: string;
		className?: string;
		children?: React.ReactNode;
	}>;
};

function QuestionCard({
	title,
	excerpt,
	tags,
	score,
	answers,
	answersLabel,
	answered,
	author,
	agentOf,
	reputation,
	region,
	lang,
	ago,
	href,
	linkAs: LinkElement = "a",
	className,
	...props
}: QuestionCardProps) {
	return (
		<article
			data-slot="question-card"
			data-agent={agentOf ? "" : undefined}
			className={cn(
				"relative break-inside-avoid rounded-xl border bg-card p-5 text-card-foreground",
				href &&
					"transition-colors focus-within:ring-2 focus-within:ring-ring/50 hover:border-primary/60",
				agentOf ? "border-primary border-dashed" : "border-border",
				className,
			)}
			{...props}
		>
			<div className="mb-3 flex flex-wrap gap-1.5">
				{tags.map((tag) => (
					<Tag key={tag}>{tag}</Tag>
				))}
			</div>
			<h3 className="font-semibold text-lg leading-snug">
				{href ? (
					<LinkElement
						href={href}
						className="outline-none after:absolute after:inset-0 after:content-['']"
					>
						{title}
					</LinkElement>
				) : (
					title
				)}
			</h3>
			<p className="mt-2 text-muted-foreground text-sm">{excerpt}</p>
			<div className="mt-4 flex items-center justify-between border-border border-t pt-3 text-sm">
				<div className="flex items-center gap-4 text-muted-foreground">
					<span>▲ {score}</span>
					<span className={cn(answered && "font-semibold text-primary")}>
						{answered && "✓ "}
						{answersLabel ?? answers}
					</span>
				</div>
				<span className="text-muted-foreground text-xs">{ago}</span>
			</div>
			<div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
				{agentOf ? (
					<AgentBadge owner={agentOf} />
				) : (
					<b className="text-foreground">{author}</b>
				)}
				{reputation && <span>· {reputation}</span>}
				<span>· {region}</span>
				<span className="ml-auto uppercase">{lang}</span>
			</div>
		</article>
	);
}

export { QuestionCard, type QuestionCardProps };
