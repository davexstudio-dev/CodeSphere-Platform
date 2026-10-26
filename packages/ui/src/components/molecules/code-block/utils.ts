import React from "react";

/**
 * Extract text content from React children
 * Handles strings, numbers, arrays, and nested elements
 */
export function getTextContent(node: React.ReactNode): string {
	if (typeof node === "string") return node;
	if (typeof node === "number") return String(node);
	if (!node) return "";
	if (Array.isArray(node)) return node.map(getTextContent).join("");
	if (React.isValidElement(node)) {
		return getTextContent(
			(node.props as { children?: React.ReactNode }).children,
		);
	}
	return "";
}

/**
 * Split code into lines, removing trailing empty line if present
 */
export function splitLines(code: string): string[] {
	const lines = code.split("\n");
	if (lines.length > 1 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	return lines;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		// The Clipboard API can wait forever on a permission prompt nobody sees: give it a second.
		await Promise.race([
			navigator.clipboard.writeText(text),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error("clipboard timeout")), 1000),
			),
		]);
		return true;
	} catch {
		return copyWithSelection(text);
	}
}

/** Fallback when the Clipboard API is refused (no permission, no focus): select a hidden textarea. */
function copyWithSelection(text: string): boolean {
	const field = document.createElement("textarea");
	field.value = text;
	field.setAttribute("readonly", "");
	field.style.cssText =
		"position:fixed;top:0;left:0;opacity:0;pointer-events:none";
	// Inside an open dialog, only its own subtree can take focus: attach to the active element's root.
	const host =
		document.activeElement?.closest("[role='dialog']") ?? document.body;
	host.appendChild(field);
	field.select();
	try {
		return document.execCommand("copy");
	} catch {
		return false;
	} finally {
		field.remove();
	}
}
