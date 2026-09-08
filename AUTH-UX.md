# Toolhub — Account UX and PostgreSQL architecture

Updated: 2026-09-08. Toolhub is a working project name.

## Confirmed scope

The product will eventually catalog internal tools and their relationships. This release covers account UI/UX only. All interface copy and source documentation are in English.

Accounts belong to the tool itself and use email/password. They do not depend on Google Workspace or Microsoft 365. PostgreSQL is the chosen database and Railway is the chosen deployment platform. No database or Railway service has been provisioned by this source package.

## Preview flows

| Screen | Interaction |
|---|---|
| Sign in | Email, password, visibility toggle, validation, loading |
| Create account | Full name, email, password, simulated verification state |
| Forgot password | Email and simulated reset-request acknowledgement |
| Email state | Explain the next step; explicitly state that no email was sent |
| Account | Minimal sample identity and sign-out action |
| Signed out | Clear in-memory preview values and return to sign in |

Select **Use demo details** to fill sample inputs. Sign-in accepts the demo email with any nonempty password, solely to simulate a successful UI transition. Other emails show a demo-only message. No credential is stored or transmitted. Reloading the page resets state.

## Proposed production flow

Registration → email verification → access approval → sign in → account/workspace → sign out.

Access approval is a recommendation for an internal application, not yet a confirmed business rule. Do not grant internal-data access solely because someone verifies an email address. Users must not assign their own roles or approval status.

Production behavior must include:

- Generic sign-in and reset errors that do not disclose account existence.
- Library-managed password hashing, verification tokens and session lifecycle.
- Server-side session and permission checks on protected pages and APIs.
- Real session revocation and cookie clearing at sign-out, including error handling.
- Expired-session, unverified-email and unapproved-account experiences.
- Email delivery and single-use, expiring verification/reset links.

## PostgreSQL model

Browser → application backend/auth library → Railway PostgreSQL.

Use the authentication library's supported schema rather than implementing cryptography or inventing a competing session system. All account and application records can reside in PostgreSQL.

| Logical data | Purpose | Ownership |
|---|---|---|
| Users | Stable ID, normalized unique email, verification time | Auth library |
| Credentials | Password hash and provider association | Auth library; never returned to UI |
| Sessions | User reference, expiry and revocation | Auth library and backend |
| Verification tokens | Email verification and password recovery | Library-managed, expiring, single-use |
| Profiles | Display name and optional avatar | Application |
| Access grants | Role, pending/active/disabled state, approver | Authorized backend operations |
| Auth events | Event type, time, user reference when known | Backend; no passwords or secret tokens |

This is a logical model, not an applied migration. Tools, departments, boards, connections, notes and tickets can later use the same PostgreSQL database.

## Railway setup boundary

The current source deploys without database credentials because it contains no persistence. When the backend is added, create PostgreSQL in the same Railway project and reference its `DATABASE_URL` from the app's server environment. Never expose that variable to browser code.

PostgreSQL is free software; hosting, backups and email delivery are separate operational costs. Railway service creation and actual deployment are not completed by this package.

## Acceptance before enabling real accounts

Verify registration, duplicate email behavior, email confirmation, wrong/correct password, pending and disabled users, expired sessions, reset-token reuse, access checks and server-side sign-out revocation. Replace demo handlers only once those flows are implemented.

## Sources

- [PostgreSQL license](https://www.postgresql.org/about/licence/)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway pricing](https://docs.railway.com/pricing/plans)
