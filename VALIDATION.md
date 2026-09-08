# Validation — 2026-09-08

- TypeScript: `npx tsc --noEmit` passed.
- Production compilation: `npm run build` passed; standalone server started successfully.
- Database integration: `npm run test:auth` passed against PGlite (PostgreSQL compiled to WebAssembly) over the pg wire protocol. Verified migrations/idempotence, initial admin bootstrap/idempotence and password login, password hashing, member signup, rejected role injection, invalid department, duplicate account prevention, bad password, persisted sessions, logout/revocation, member permission denial, self-demotion denial, admin role changes, disabling/reactivating and audit records.
- Built HTTP server: homepage and database health returned 200; unauthenticated admin request returned 401, Member returned 403, Admin list/update returned 200. Invalid-origin update returned 403. Direct auth plugin admin route returned 404. HTTPS auth configuration emitted Secure cookies.
- Targeted lint for the auth/admin implementation and source whitespace checks passed.

Native PostgreSQL execution was blocked by the local environment's shared-memory restriction, so integration used PGlite. This does not validate real PostgreSQL concurrent transactions or Railway networking. Production uses the pg driver with Railway PostgreSQL, not PGlite; no test database dependency is shipped with the app.

No browser interaction or visual testing was performed in this turn. Docker daemon was unavailable, so the complete Docker image has not been built locally. The standalone application was built and exercised. Docker explicitly includes production dependencies needed by startup migration/bootstrap scripts.

Railway variables, deployment and real production account creation are still owner-side steps. No production credentials were read and no real admin password is committed.
