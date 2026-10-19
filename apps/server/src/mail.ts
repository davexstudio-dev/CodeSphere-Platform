import type { Context } from "@codesphere/api/context";
import type { AuthHooks } from "@codesphere/auth";
import {
	composeEmail,
	createEmailClient,
	type EmailEnv,
	type EmailTransport,
	localeFromAcceptLanguage,
} from "@codesphere/email";
import type { Logger } from "@codesphere/logger";

/**
 * The messages the API sends on its own initiative. The recipient address is never logged
 * (spec §4): a failed send is reported by status and message id only.
 */
export function createMailHooks(
	env: EmailEnv,
	logger: Pick<Logger, "warn" | "info">,
	development = false,
	transport?: EmailTransport,
): AuthHooks {
	const mail = createEmailClient(env, transport);
	return {
		async sendSignInOtp(email, otp, acceptLanguage) {
			const result = await mail.send({
				to: email,
				...composeEmail({
					kind: "sign-in-code",
					props: {
						code: otp,
						locale: localeFromAcceptLanguage(acceptLanguage),
					},
				}),
			});
			// Local development: the code is also in the server log, whatever the mail provider
			// says (no address, spec §4). Never outside development.
			if (development) {
				logger.info({ otp }, "sign-in code (development)");
			}
			if (result.status === "failed") {
				logger.warn({ message: result.message }, "sign-in code not sent");
				// A code that never left must not read as sent: the request fails, so the
				// sign-in form shows an error and the Member can ask for another code.
				throw new Error("The sign-in code could not be sent.");
			}
		},
		async onMemberCreated(member, acceptLanguage) {
			const result = await mail.send({
				to: member.email,
				// A retried hook never sends the welcome twice.
				idempotencyKey: `welcome/${member.id}`,
				...composeEmail({
					kind: "welcome",
					props: {
						name: member.name,
						locale: localeFromAcceptLanguage(acceptLanguage),
					},
				}),
			});
			if (result.status === "failed") {
				logger.warn({ message: result.message }, "welcome email not sent");
			}
		},
	};
}

/** The API's own notifications (#52): the Owner is told a key was created, never given the key. */
export function createNotifications(
	env: EmailEnv,
	logger: Pick<Logger, "warn">,
): NonNullable<Context["notifications"]> {
	const mail = createEmailClient(env);
	return {
		async agentPaused(member, agentName) {
			const result = await mail.send({
				to: member.email,
				...composeEmail({
					kind: "agent-paused",
					props: { name: member.name, agentName },
				}),
			});
			if (result.status === "failed") {
				logger.warn({ message: result.message }, "agent paused email not sent");
			}
		},
		async apiKeyCreated(member, keyName) {
			const result = await mail.send({
				to: member.email,
				...composeEmail({
					kind: "api-key-created",
					props: { name: member.name, keyName },
				}),
			});
			if (result.status === "failed") {
				logger.warn({ message: result.message }, "key email not sent");
			}
		},
	};
}
