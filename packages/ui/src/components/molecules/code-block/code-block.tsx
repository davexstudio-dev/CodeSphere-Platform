import { normalizeLanguage } from "@codesphere/ui/components/molecules/code-block/languages";
import { tokenStyles } from "@codesphere/ui/components/molecules/code-block/styles";
import {
	type TokenizeContext,
	tokenize,
} from "@codesphere/ui/components/molecules/code-block/tokenizer";
import {
	copyToClipboard,
	getTextContent,
	splitLines,
} from "@codesphere/ui/components/molecules/code-block/utils";
import { ScrollArea } from "@codesphere/ui/components/molecules/scroll-area";
import { cn } from "@codesphere/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import type React from "react";
import { memo, useMemo, useState } from "react";

export {
	getLanguage,
	normalizeLanguage,
} from "@codesphere/ui/components/molecules/code-block/languages";
// Re-export types for consumers
export type {
	LanguageDefinition,
	Token,
	TokenType,
} from "@codesphere/ui/components/molecules/code-block/types";

/**
 * Tokenize all lines with context passing between lines
 * This handles multiline constructs like template literals
 */
function tokenizeLines(lines: string[], language: string) {
	const tokenizedLines: { tokens: ReturnType<typeof tokenize>["tokens"] }[] =
		[];
	let context: TokenizeContext = {};

	for (const line of lines) {
		const result = tokenize(line, language, context);
		tokenizedLines.push({ tokens: result.tokens });
		context = result.context;
	}

	return tokenizedLines;
}

/**
 * Renders a single line with pre-computed tokens
 */
const HighlightedLine = memo(function HighlightedLine({
	tokens,
}: {
	tokens: ReturnType<typeof tokenize>["tokens"];
}) {
	return (
		<>
			{tokens.map((token, i) =>
				token.type ? (
					<span key={i} className={tokenStyles[token.type]}>
						{token.content}
					</span>
				) : (
					<span key={i}>{token.content}</span>
				),
			)}
		</>
	);
});

export interface CodeBlockProps {
	children: React.ReactNode;
	language?: string;
	className?: string;
	/** Show line numbers (default: true) */
	showLineNumbers?: boolean;
	/** Show copy button (default: true) */
	showCopyButton?: boolean;
	/** Show language header (default: true) */
	showHeader?: boolean;
	/** Enable syntax highlighting (default: true) */
	enableHighlighting?: boolean;
	/** Custom text size class */
	textSize?: string;
}

/**
 * Full-featured code block with syntax highlighting, line numbers, and copy button
 */
export const CodeBlock = memo(function CodeBlock({
	children,
	language,
	className,
	showLineNumbers = true,
	showCopyButton = true,
	showHeader = true,
	enableHighlighting = true,
	textSize,
}: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const text = getTextContent(children);
	const lines = splitLines(text);
	const normalizedLang = normalizeLanguage(language);

	// Pre-tokenize all lines with context passing for multiline support
	const tokenizedLines = useMemo(
		() => (enableHighlighting ? tokenizeLines(lines, normalizedLang) : null),
		[lines, normalizedLang, enableHighlighting],
	);

	const handleCopy = async () => {
		const success = await copyToClipboard(text);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	};

	return (
		<div
			className={cn(
				"group/codeblock relative my-6 flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/40 dark:bg-muted/20",
				className,
			)}
		>
			{/* Header bar */}
			{showHeader && (
				<div className="flex flex-none items-center justify-between border-border/30 border-b bg-muted px-2 py-2">
					<span className="font-mono text-xs text-zinc-500">
						{language || "code"}
					</span>
					{showCopyButton && (
						<button
							type="button"
							onClick={handleCopy}
							className="flex cursor-pointer items-center gap-1.5 rounded text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
							aria-label="Copy code"
						>
							{copied ? (
								<>
									<Check className="h-3.5 w-3.5 text-emerald-400" />
									<span>copied!</span>
								</>
							) : (
								<>
									<Copy className="h-3.5 w-3.5" />
									<span>copy</span>
								</>
							)}
						</button>
					)}
				</div>
			)}

			{/* Code content */}
			<ScrollArea orientation="both" className="min-h-0 flex-1">
				<pre className="p-4">
					<code className={cn("grid font-mono", textSize || "text-xs")}>
						{lines.map((line, i) => (
							<span
								key={i}
								className={cn(
									"grid gap-6",
									showLineNumbers ? "grid-cols-[auto_1fr]" : "grid-cols-1",
								)}
							>
								{showLineNumbers && (
									<span className="min-w-[2ch] select-none text-right text-xs text-zinc-600 leading-6">
										{i + 1}
									</span>
								)}
								<span className="whitespace-pre leading-6">
									{tokenizedLines ? (
										<HighlightedLine
											tokens={
												tokenizedLines[i]?.tokens ?? [
													{ type: null, content: line || " " },
												]
											}
										/>
									) : (
										line || " "
									)}
								</span>
							</span>
						))}
					</code>
				</pre>
			</ScrollArea>
		</div>
	);
});

export interface CompactCodeBlockProps {
	children: React.ReactNode;
	className?: string;
	textSize?: string;
	/** Optional language for syntax highlighting */
	language?: string;
}

/**
 * Simpler code block for compact/chat contexts
 * Optional syntax highlighting, minimal styling
 */
export const CompactCodeBlock = memo(function CompactCodeBlock({
	children,
	className,
	textSize = "text-xs",
	language,
}: CompactCodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const text = getTextContent(children);
	const lines = splitLines(text);
	const normalizedLang = language ? normalizeLanguage(language) : null;

	// Pre-tokenize if language is provided
	const tokenizedLines = useMemo(
		() => (normalizedLang ? tokenizeLines(lines, normalizedLang) : null),
		[lines, normalizedLang],
	);

	const handleCopy = async () => {
		const success = await copyToClipboard(text);
		if (success) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		}
	};

	return (
		<div
			className={cn(
				"group/codeblock relative block min-w-0 max-w-full rounded-lg bg-muted/30",
				className,
			)}
		>
			<button
				type="button"
				onClick={handleCopy}
				className="absolute top-1 right-1 z-10 cursor-pointer rounded border border-border bg-background/80 p-1.5 opacity-0 transition-opacity hover:bg-background group-hover/codeblock:opacity-100"
				aria-label="Copy code"
			>
				{copied ? (
					<Check className="h-3.5 w-3.5 text-pink-400" />
				) : (
					<Copy className="h-3.5 w-3.5 text-muted-foreground" />
				)}
			</button>
			<ScrollArea orientation="both" className="max-h-[inherit]">
				<div className="p-2">
					<pre>
						<code className="grid">
							{lines.map((line, i) => (
								<span key={i} className="grid grid-cols-[auto_1fr] gap-4">
									<span
										className={cn(
											textSize,
											"min-w-[2ch] select-none text-right text-muted-foreground/30",
										)}
									>
										{i + 1}
									</span>
									<span
										className={cn(
											textSize,
											"whitespace-pre-wrap break-all",
											!tokenizedLines && "text-muted-foreground",
										)}
									>
										{tokenizedLines ? (
											<HighlightedLine
												tokens={
													tokenizedLines[i]?.tokens ?? [
														{ type: null, content: line || " " },
													]
												}
											/>
										) : (
											line || " "
										)}
									</span>
								</span>
							))}
						</code>
					</pre>
				</div>
			</ScrollArea>
		</div>
	);
});
