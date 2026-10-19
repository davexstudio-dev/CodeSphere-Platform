"use client";

import { Toaster } from "@codesphere/ui/components/atoms/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { setupPersistence } from "@/lib/persist";
import { createQueryClient } from "@/utils/orpc";

import { OutboxProvider } from "./outbox-provider";
import { PwaRegister } from "./pwa-register";
import { ThemeProvider } from "./theme-provider";
import { WebVitalsReporter } from "./web-vitals-reporter";

export default function Providers({
	children,
	nonce,
}: {
	children: React.ReactNode;
	/** CSP nonce of the request, for the theme script next-themes inlines. */
	nonce?: string;
}) {
	const t = useTranslations("errors");
	// One QueryClient per mount, never shared between server requests.
	const [queryClient] = useState(() => {
		const client = createQueryClient((code) => t(code), t("retry"));
		setupPersistence(client);
		return client;
	});

	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
			nonce={nonce}
		>
			<QueryClientProvider client={queryClient}>
				<OutboxProvider>{children}</OutboxProvider>
				<PwaRegister />
				<WebVitalsReporter />
				<ReactQueryDevtools />
			</QueryClientProvider>
			<Toaster richColors />
		</ThemeProvider>
	);
}
