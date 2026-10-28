import { Button } from "@codesphere/ui/components/atoms/button";
import { Skeleton } from "@codesphere/ui/components/atoms/skeleton";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@codesphere/ui/components/molecules/alert";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@codesphere/ui/components/molecules/empty";

type StateGateProps = {
	status: "loading" | "error" | "empty" | "ready";
	/** Error state: the title and the explanation (a typed error's message, translated). */
	errorTitle?: string;
	errorText?: string;
	onRetry?: () => void;
	retryLabel?: string;
	emptyTitle?: string;
	emptyText?: string;
	/** Empty state call to action, e.g. « Nouveau Tag ». */
	emptyAction?: React.ReactNode;
	loadingLabel?: string;
	children: React.ReactNode;
};

/** Loading, error or empty in place of an admin screen, then the screen itself (#131). */
function StateGate({
	status,
	errorTitle = "Impossible de charger",
	errorText = "Le serveur ne répond pas. Rien n'a été modifié.",
	onRetry,
	retryLabel = "Réessayer",
	emptyTitle = "Rien à administrer",
	emptyText = "Aucun élément pour l'instant.",
	emptyAction,
	loadingLabel = "Chargement",
	children,
}: StateGateProps) {
	if (status === "loading") {
		return (
			<div
				data-slot="state-gate"
				role="status"
				aria-busy="true"
				aria-label={loadingLabel}
				className="flex flex-col gap-2"
			>
				{[0, 1, 2, 3].map((row) => (
					<Skeleton key={row} className="h-9 w-full" />
				))}
			</div>
		);
	}
	if (status === "error") {
		return (
			<Alert data-slot="state-gate" variant="destructive">
				<AlertTitle>{errorTitle}</AlertTitle>
				<AlertDescription>
					<span className="flex flex-col items-start gap-2">
						{errorText}
						{onRetry && (
							<Button variant="outline" size="sm" onClick={onRetry}>
								{retryLabel}
							</Button>
						)}
					</span>
				</AlertDescription>
			</Alert>
		);
	}
	if (status === "empty") {
		return (
			<Empty data-slot="state-gate">
				<EmptyHeader>
					<EmptyTitle>{emptyTitle}</EmptyTitle>
					<EmptyDescription>{emptyText}</EmptyDescription>
				</EmptyHeader>
				{emptyAction && <EmptyContent>{emptyAction}</EmptyContent>}
			</Empty>
		);
	}
	return children;
}

export { StateGate, type StateGateProps };
