"use client";

import { Button } from "@codesphere/ui/components/atoms/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@codesphere/ui/components/molecules/dialog";
import {
	LoginCard,
	type LoginCardProps,
} from "@codesphere/ui/components/organisms/login-card";

type LoginDialogProps = Omit<LoginCardProps, "hideHeading" | "className"> & {
	/** The element that opens the dialog. Defaults to a « Se connecter » button. */
	trigger?: React.ReactElement;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	/** No trigger of its own: the dialog is opened by `open`, e.g. from a menu item. */
	withoutTrigger?: boolean;
};

/** Reusable login: a button that opens the SSO sign-in in a modal. */
function LoginDialog({
	trigger,
	open,
	onOpenChange,
	withoutTrigger = false,
	...cardProps
}: LoginDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{!withoutTrigger && (
				<DialogTrigger
					render={trigger ?? <Button size="lg" className="h-10 min-w-44" />}
				>
					{trigger ? undefined : "Se connecter"}
				</DialogTrigger>
			)}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Se connecter</DialogTitle>
					<DialogDescription>
						Choisissez le compte avec lequel vous voulez rejoindre CodeSphere.
					</DialogDescription>
				</DialogHeader>
				<LoginCard hideHeading {...cardProps} />
			</DialogContent>
		</Dialog>
	);
}

export { LoginDialog, type LoginDialogProps };
