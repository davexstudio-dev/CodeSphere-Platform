"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { CodeBlock } from "@codesphere/ui/components/molecules/code-block";
import { cn } from "@codesphere/ui/lib/utils";
import { CodeIcon } from "lucide-react";
import { createContext, useContext, useId, useState } from "react";
import sources from "./specimen-sources.generated.json";

const SOURCES = sources as Record<string, { code: string; files: string[] }>;

const ShowAllCode = createContext<{
	showAll: boolean;
	setShowAll: (value: boolean) => void;
}>({ showAll: false, setShowAll: () => {} });

/** Holds the « show all the code » switch of the page. */
export function SpecimenCodeProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [showAll, setShowAll] = useState(false);
	return (
		<ShowAllCode.Provider value={{ showAll, setShowAll }}>
			{children}
		</ShowAllCode.Provider>
	);
}

/** Shows or hides the code of every specimen at once. */
export function ShowAllCodeButton() {
	const { showAll, setShowAll } = useContext(ShowAllCode);
	return (
		<Button
			variant="outline"
			size="sm"
			aria-pressed={showAll}
			onClick={() => setShowAll(!showAll)}
		>
			<CodeIcon />
			{showAll ? "Masquer tout le code" : "Afficher tout le code"}
		</Button>
	);
}

/**
 * One component of the design system: the component, and beside it (below on a narrow column) the
 * code that renders it, as written in the page, with the files of the components it uses. The code
 * comes from specimen-sources.generated.json (`bun run ds:sources`).
 */
export function Specimen({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const { showAll } = useContext(ShowAllCode);
	const [own, setOwn] = useState<boolean | null>(null);
	const codeId = useId();
	const source = SOURCES[label];
	const open = (own ?? showAll) && !!source;

	return (
		<div data-toc-item className="@container flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-muted-foreground text-xs">{label}</span>
				{source && (
					<Button
						variant="ghost"
						size="xs"
						aria-expanded={open}
						aria-controls={codeId}
						onClick={() => setOwn(!open)}
					>
						<CodeIcon />
						{open ? "Masquer le code" : "Code"}
					</Button>
				)}
			</div>
			<div className={cn("grid gap-3", open && "@3xl:grid-cols-2")}>
				<div className="flex min-w-0 flex-wrap items-center gap-3 self-start rounded-md border p-4">
					{children}
				</div>
				{open && source && (
					<div id={codeId} className="flex min-w-0 flex-col gap-1.5">
						<CodeBlock language="tsx" className="max-h-[32rem] overflow-auto">
							{source.code}
						</CodeBlock>
						{source.files.length > 0 && (
							<p className="font-mono text-muted-foreground text-xs">
								{source.files.join(" · ")}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
