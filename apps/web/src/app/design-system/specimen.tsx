"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { CodeBlock } from "@codesphere/ui/components/molecules/code-block";
import { copyToClipboard } from "@codesphere/ui/components/molecules/code-block/utils";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@codesphere/ui/components/molecules/dialog";
import { SegmentedControl } from "@codesphere/ui/components/molecules/segmented-control";
import { CheckIcon, CodeIcon, CopyIcon, FileCodeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import sources from "./specimen-sources.generated.json";

type Source = { imports: string; jsx: string; files: string[] };
const SOURCES = sources as Record<string, Source>;

const VIEWS = ["all", "jsx", "imports"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABELS: Record<View, string> = {
	all: "Tout",
	jsx: "JSX",
	imports: "Imports",
};

const codeOf = (source: Source, view: View) =>
	view === "imports"
		? source.imports
		: view === "jsx"
			? source.jsx
			: [source.imports, source.jsx].filter(Boolean).join("\n\n");

/** The button that copies what the viewer shows, and says so. */
function CopyButton({ text }: { text: string }) {
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	return (
		<Button
			size="sm"
			variant={state === "idle" ? "default" : "secondary"}
			onClick={async () => {
				setState((await copyToClipboard(text)) ? "copied" : "failed");
				clearTimeout(timer.current);
				timer.current = setTimeout(() => setState("idle"), 1800);
			}}
		>
			{state === "copied" ? <CheckIcon /> : <CopyIcon />}
			<span aria-live="polite">
				{state === "copied"
					? "Copié"
					: state === "failed"
						? "Copie impossible"
						: "Copier"}
			</span>
		</Button>
	);
}

/** The code of one specimen in a dialog: what to copy (all, the JSX or the imports), and where it lives. */
function CodeDialog({
	label,
	source,
	open,
	onOpenChange,
}: {
	label: string;
	source: Source;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [view, setView] = useState<View>("all");
	const text = codeOf(source, view);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent flush className="max-w-4xl">
				<div className="border-b px-5 pt-5 pb-4">
					<DialogHeader>
						<DialogTitle>
							<span className="block truncate">{label}</span>
						</DialogTitle>
						<DialogDescription>
							<span className="flex flex-wrap items-center gap-1.5">
								{source.files.length > 0 ? (
									source.files.map((file) => (
										<span
											key={file}
											className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
										>
											<FileCodeIcon className="size-3" />
											{file.replace("packages/ui/src/components/", "")}
										</span>
									))
								) : (
									<span>
										Code de l'exemple, tel qu'il est écrit dans la page.
									</span>
								)}
							</span>
						</DialogDescription>
					</DialogHeader>
				</div>
				<div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-5 py-2.5">
					<SegmentedControl
						options={VIEWS}
						value={view}
						onValueChange={setView}
						labels={VIEW_LABELS}
						aria-label="Partie du code à afficher"
					/>
					<CopyButton text={text} />
				</div>
				<CodeBlock
					language="tsx"
					showHeader={false}
					bare
					className="max-h-[min(60svh,34rem)]"
				>
					{text || "// Rien à importer : l'exemple n'utilise que du HTML."}
				</CodeBlock>
			</DialogContent>
		</Dialog>
	);
}

/**
 * One component of the design system, with a Code button that opens its code in a dialog: the JSX
 * as written in the page and the imports of the components it uses, each copyable. The code comes
 * from specimen-sources.generated.json (`bun run ds:sources`).
 */
export function Specimen({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const source = SOURCES[label];

	return (
		<div data-toc-item className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="font-mono text-muted-foreground text-xs">{label}</span>
				{source && (
					<Button
						variant="chip"
						size="xs"
						aria-haspopup="dialog"
						className="shrink-0"
						onClick={() => setOpen(true)}
					>
						<CodeIcon />
						Voir le code
					</Button>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-3 rounded-md border p-4">
				{children}
			</div>
			{source && (
				<CodeDialog
					label={label}
					source={source}
					open={open}
					onOpenChange={setOpen}
				/>
			)}
		</div>
	);
}
