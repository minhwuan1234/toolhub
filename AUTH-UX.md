# Toolhub account flow

English-only interface using the black primary color (#000000), temporary Notion logo, and animated department diagram.

## Registration and sessions

Register with full name, email, department and a password of 12–128 characters. Supported departments: Account, Business Development, Production, Project Management, HR, Andy Tran, Marketing.

Registration creates a Member. The client returns to sign-in with neutral guidance; it does not claim email delivery or verification. Sign-in establishes a Better Auth session backed by PostgreSQL. Reload retrieves the session from the backend. Logout revokes the current session and clears its cookie. Errors remain visible and do not simulate success.

Only authenticated users see their own account. The old design-review `?view=account` bypass has been removed. There is no password-reset UI until recovery is implemented.

## Administration

The first admin is provisioned through private Railway Variables at startup. No hardcoded password exists. `minhwuan889@gmail.com` is the requested initial admin email; the password is entered privately by the owner.

Admins see a searchable, paginated account table with department, role, status and join date. They explicitly save each row. Roles are Member (`user` in PostgreSQL) and Admin (`admin`). Disabling or changing a role revokes all sessions. Admins cannot disable/demote themselves. Each write rechecks the acting user's database role inside a serialized transaction and records an audit event.

Normal registration cannot set role, ban status or any other administrative attribute. Direct Better Auth admin HTTP endpoints are not exposed. The custom admin API validates sessions, origin and inputs.

## Current limits

Registration is open; email verification and access approval are not enabled. A Member has no internal tool data access in this release. No recovery email, account deletion or password-reset action is implemented. The department graph is decorative, not a real workflow engine.
