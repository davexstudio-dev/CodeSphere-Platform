import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";

export { composeEmail, type EmailMessage } from "./compose";
export {
	DEFAULT_LOCALE,
	type Locale,
	localeFromAcceptLanguage,
} from "./locale";
export {
	ACCOUNT_DELETED_SUBJECTS,
	AccountDeleted,
	type AccountDeletedProps,
} from "./templates/account-deleted";
export {
	AGENT_PAUSED_SUBJECTS,
	AgentPaused,
	type AgentPausedProps,
} from "./templates/agent-paused";
export {
	API_KEY_CREATED_SUBJECTS,
	ApiKeyCreated,
	type ApiKeyCreatedProps,
} from "./templates/api-key-created";
export {
	MEMBER_REACTIVATED_SUBJECTS,
	MemberReactivated,
	type MemberReactivatedProps,
} from "./templates/member-reactivated";
export {
	MEMBER_SUSPENDED_SUBJECTS,
	MemberSuspended,
	type MemberSuspendedProps,
} from "./templates/member-suspended";
export {
	SIGN_IN_CODE_SUBJECTS,
	SignInCode,
	type SignInCodeProps,
} from "./templates/sign-in-code";
export {
	WELCOME_SUBJECT,
	WELCOME_SUBJECTS,
	Welcome,
	type WelcomeProps,
} from "./templates/welcome";

export type EmailEnv = {
	/** Resend API key. Without it, sending is disabled and `send` reports "disabled". */
	RESEND_API_KEY?: string;
	/** Sender, e.g. "CodeSphere Platform <no-reply@codesphereplatform.xyz>" (a domain verified in Resend). */
	EMAIL_FROM?: string;
};

export type SendEmailInput = {
	to: string;
	subject: string;
	template: ReactElement;
	/** Stable key so a retried job never sends the same email twice. */
	idempotencyKey?: string;
};

export type SendEmailResult =
	| { status: "sent"; id: string }
	| { status: "disabled" }
	| { status: "failed"; message: string };

export type EmailTransport = {
	emails: {
		send(
			payload: {
				from: string;
				to: string;
				subject: string;
				html: string;
				text: string;
			},
			options?: { idempotencyKey?: string },
		): Promise<{
			data: { id: string } | null;
			error: { message: string } | null;
		}>;
	};
};

// The transport is injectable so tests never reach Resend. Recipient addresses are never
// logged by this package (spec §4: no email in logs).
export function createEmailClient(env: EmailEnv, transport?: EmailTransport) {
	const from = env.EMAIL_FROM;
	const client: EmailTransport | undefined =
		transport ??
		(env.RESEND_API_KEY
			? (new Resend(env.RESEND_API_KEY) as EmailTransport)
			: undefined);

	return {
		enabled: Boolean(client && from),
		async send(input: SendEmailInput): Promise<SendEmailResult> {
			if (!client || !from) {
				return { status: "disabled" };
			}
			const [html, text] = await Promise.all([
				render(input.template),
				render(input.template, { plainText: true }),
			]);
			const { data, error } = await client.emails.send(
				{ from, to: input.to, subject: input.subject, html, text },
				input.idempotencyKey
					? { idempotencyKey: input.idempotencyKey }
					: undefined,
			);
			if (error || !data) {
				return { status: "failed", message: error?.message ?? "no response" };
			}
			return { status: "sent", id: data.id };
		},
	};
}
