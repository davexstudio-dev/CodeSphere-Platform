"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import { Input } from "@codesphere/ui/components/atoms/input";
import { Textarea } from "@codesphere/ui/components/atoms/textarea";
import { cn } from "@codesphere/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: the shadcn input group frames one field; a fieldset would add its own border and minimum width
		<div
			data-slot="input-group"
			role="group"
			className={cn(
				"group/input-group relative flex h-8 w-full min-w-0 items-center rounded-md border border-input bg-background shadow-xs outline-none transition-[color,box-shadow] has-[>textarea]:h-auto dark:bg-input/30",
				"has-[>[data-align=inline-end]]:[&>input]:pr-2 has-[>[data-align=inline-start]]:[&>input]:pl-2",
				"has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
				"has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",
				"has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
				"has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-1 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
				className,
			)}
			{...props}
		/>
	);
}

const inputGroupAddonVariants = cva(
	"flex h-auto cursor-text select-none items-center justify-center gap-2 py-1.5 font-medium text-muted-foreground text-xs group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-sm [&>svg:not([class*='size-'])]:size-4",
	{
		variants: {
			align: {
				"inline-start":
					"order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
				"inline-end":
					"order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
				"block-start":
					"order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
				"block-end":
					"order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
			},
		},
		defaultVariants: {
			align: "inline-start",
		},
	},
);

function InputGroupAddon({
	className,
	align = "inline-start",
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: a click on the addon only focuses the field, which the keyboard reaches directly
		// biome-ignore lint/a11y/useSemanticElements: same frame as InputGroup, a fieldset would add its own border
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(inputGroupAddonVariants({ align }), className)}
			onClick={(e) => {
				if ((e.target as HTMLElement).closest("button")) {
					return;
				}
				e.currentTarget.parentElement
					?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
						"input, textarea",
					)
					?.focus();
			}}
			{...props}
		/>
	);
}

function InputGroupButton({
	className,
	type = "button",
	variant = "ghost",
	size = "xs",
	...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> & {
	size?: "xs" | "sm" | "icon-xs" | "icon-sm";
	type?: "button" | "submit" | "reset";
}) {
	return (
		<Button
			type={type}
			data-size={size}
			variant={variant}
			size={size ?? "xs"}
			className={className}
			{...props}
		/>
	);
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"flex items-center gap-2 text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
				className,
			)}
			{...props}
		/>
	);
}

function InputGroupInput({
	className,
	...props
}: React.ComponentProps<"input">) {
	return (
		<Input
			data-slot="input-group-control"
			variant="bare"
			className={cn("flex-1", className)}
			{...props}
		/>
	);
}

function InputGroupTextarea({
	className,
	...props
}: React.ComponentProps<"textarea">) {
	return (
		<Textarea
			data-slot="input-group-control"
			variant="bare"
			className={cn("flex-1", className)}
			{...props}
		/>
	);
}

export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
	InputGroupText,
	InputGroupTextarea,
};
