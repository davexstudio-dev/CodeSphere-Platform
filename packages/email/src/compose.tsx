/** @jsxImportSource react */
import type { ReactElement } from "react";

import { DEFAULT_LOCALE } from "./locale";
import {
	ACCOUNT_DELETED_SUBJECTS,
	AccountDeleted,
	type AccountDeletedProps,
} from "./templates/account-deleted";
import {
	AGENT_PAUSED_SUBJECTS,
	AgentPaused,
	type AgentPausedProps,
} from "./templates/agent-paused";
import {
	API_KEY_CREATED_SUBJECTS,
	ApiKeyCreated,
	type ApiKeyCreatedProps,
} from "./templates/api-key-created";
import {
	MEMBER_REACTIVATED_SUBJECTS,
	MemberReactivated,
	type MemberReactivatedProps,
} from "./templates/member-reactivated";
import {
	MEMBER_SUSPENDED_SUBJECTS,
	MemberSuspended,
	type MemberSuspendedProps,
} from "./templates/member-suspended";
import {
	SIGN_IN_CODE_SUBJECTS,
	SignInCode,
	type SignInCodeProps,
} from "./templates/sign-in-code";
import {
	WELCOME_SUBJECTS,
	Welcome,
	type WelcomeProps,
} from "./templates/welcome";

/** Every message CodeSphere Platform can send. A new message is a new variant here, nowhere else. */
export type EmailMessage =
	| { kind: "welcome"; props: WelcomeProps }
	| { kind: "account-deleted"; props: AccountDeletedProps }
	| { kind: "member-suspended"; props: MemberSuspendedProps }
	| { kind: "member-reactivated"; props: MemberReactivatedProps }
	| { kind: "api-key-created"; props: ApiKeyCreatedProps }
	| { kind: "agent-paused"; props: AgentPausedProps }
	| { kind: "sign-in-code"; props: SignInCodeProps };

/** The subject and the body of a message, in the language of its props. */
export function composeEmail(message: EmailMessage): {
	subject: string;
	template: ReactElement;
} {
	const locale = message.props.locale ?? DEFAULT_LOCALE;
	switch (message.kind) {
		case "welcome":
			return {
				subject: WELCOME_SUBJECTS[locale],
				template: <Welcome {...message.props} />,
			};
		case "account-deleted":
			return {
				subject: ACCOUNT_DELETED_SUBJECTS[locale],
				template: <AccountDeleted {...message.props} />,
			};
		case "member-suspended":
			return {
				subject: MEMBER_SUSPENDED_SUBJECTS[locale],
				template: <MemberSuspended {...message.props} />,
			};
		case "member-reactivated":
			return {
				subject: MEMBER_REACTIVATED_SUBJECTS[locale],
				template: <MemberReactivated {...message.props} />,
			};
		case "api-key-created":
			return {
				subject: API_KEY_CREATED_SUBJECTS[locale],
				template: <ApiKeyCreated {...message.props} />,
			};
		case "agent-paused":
			return {
				subject: AGENT_PAUSED_SUBJECTS[locale],
				template: <AgentPaused {...message.props} />,
			};
		case "sign-in-code":
			return {
				subject: SIGN_IN_CODE_SUBJECTS[locale],
				template: <SignInCode {...message.props} />,
			};
	}
}
