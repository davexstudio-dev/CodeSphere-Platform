// The consent version is a counter in the database (#341), raised when the terms or the privacy
// policy are published with « important change »: the sign-in page and the auth server both read it
// there (`legal.versions`, `currentLegalVersions`), so they cannot drift apart and silently refuse
// every new account (#63).

/** Cookie the sign-in page sets once the consent box is ticked, read when the account is created. */
export const CONSENT_COOKIE = "consent_version";
