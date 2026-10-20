# Staff roles live in the database, the environment only guarantees the super admins

A staff role (moderator, admin, super_admin) is stored on the Member and changed from the back-office through audited procedures. The staff email lists of the environment no longer decide it: `ADMIN_EMAILS` and `MODERATOR_EMAILS` only seed the role of an account when it is created, and `SUPER_ADMIN_EMAILS` puts a verified email back to super_admin at every sign-in. We chose this over re-deriving every role from the lists at each sign-in (#120) because the back-office must be able to bring people in and out without a redeploy, while the platform must never lose its top role.

What each role may do is the access control of Better Auth's admin plugin (`packages/auth/src/access.ts`), read by the API guard and by the back-office screens alike. The plugin's own set-role, ban and impersonate endpoints stay closed: a role change, a deactivation or a session revocation goes through the API, where the change and its audit row land in one statement (`withAudit`), which the plugin's endpoints cannot do.

## Consequences

- A role change is audited as `member.set_role` with the old and new role. A demotion or a deactivation deletes the Member's sessions in the same statement, so the lost access is immediate.
- Rank still rules: a staff member acts only on a role strictly below theirs. The super_admin is the exception and reaches other super admins, under two guards: a `SUPER_ADMIN_EMAILS` member is never demoted (the next sign-in would undo it) and the last active super_admin is never demoted.
- Removing an email from `ADMIN_EMAILS` or `MODERATOR_EMAILS` no longer demotes anyone: demote from the back-office instead.
- Inviting staff by email (#286) builds on the stored role: the invitation sets it when the invited email first signs in.
