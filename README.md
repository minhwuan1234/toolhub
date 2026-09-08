# Toolhub — Account UI

English-only account interface for an internal tools workspace, inspired by the project's Notion-style design system.

## What is included

- Sign in, create account and password-reset screens.
- Validation, loading, password visibility and simulated email states.
- Minimal account screen and sign-out interaction.
- Responsive layout and keyboard focus handling.
- Node.js standalone production output, Dockerfile and Railway configuration.

**This is an interactive UI prototype, not a working authentication service.** It does not create accounts, send email, store passwords or connect to a database. All preview state is in memory and resets on reload. No real internal data is included.

Choose **Use demo details**, then **Sign in**, to preview the account screen. The demo email is `demo@example.com`. The sample password is a UI placeholder; it is not authenticated. Do not enter real credentials.

## Run locally

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local address printed by the dev server.

## Production

```sh
npm run build
npm start
```

The standalone server reads `PORT` (default 3000) and `HOST` (default 0.0.0.0). Do not use the development server as a Railway start command.

## GitHub → Railway

1. Put this folder's contents at the root of your GitHub repository. Include `package-lock.json`, `Dockerfile`, `railway.json` and the source files.
2. In Railway, create a project and choose **Deploy from GitHub repo**. Select the repository and deployment branch.
3. Railway detects the root `Dockerfile`. It builds the standalone app and starts the Node.js server. No start-command override is required.
4. After deployment succeeds, generate a domain in the service's Networking settings. The app listens on Railway's `PORT`.
5. Subsequent pushes to the connected branch can trigger deployments according to your Railway settings.

If this folder is inside a larger repository, set the Railway service's root directory to the folder containing `package.json` and `Dockerfile`.

No environment secrets are needed for this UI-only release. `.env.example` documents the runtime options; never commit real `.env` files.

[Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles) · [GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys)

## PostgreSQL — next phase

Decision: store application data in **PostgreSQL on Railway**. No Supabase, Firebase or SQLite service is required.

When real authentication is implemented:

1. Add a PostgreSQL service to the same Railway project.
2. Add a backend-only `DATABASE_URL` variable to the app by referencing the database service's `DATABASE_URL`. Use Railway's variable selector so the reference matches your actual service name.
3. Use a maintained authentication library with a PostgreSQL adapter for credentials and sessions, with migrations for profiles and access grants.
4. Configure email delivery, verification/reset redirects, server-side authorization and secure session cookies.
5. Run and verify database migrations before enabling real registration.

Adding `DATABASE_URL` alone does **not** make this prototype's forms real. There is no database driver, schema migration or auth backend implemented in this release.

PostgreSQL has no license fee. Railway hosting and database resources may incur charges according to the selected plan and usage. [PostgreSQL license](https://www.postgresql.org/about/licence/) · [Railway PostgreSQL](https://docs.railway.com/databases/postgresql) · [Railway pricing](https://docs.railway.com/pricing/plans)

## Source layout

- `app/page.tsx`: account screens and demo-only interactions.
- `app/globals.css`: visual tokens and responsive styles.
- `components/ui`: installed UI primitives.
- `DESIGN.md`: English project design rules.
- `AUTH-UX.md`: account flow and PostgreSQL architecture decisions.
- `Dockerfile` / `railway.json`: Railway deployment configuration.

Stack: React, TypeScript, Vinext, Tailwind CSS, Base UI/Shadcn and Lucide. The scaffold includes additional UI primitives for later reuse. The current build uses Vinext's standalone Node.js target, not Cloudflare Workers.
