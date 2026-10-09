# Toolhub

Internal account application with email/password registration, login, logout and admin account management. English UI, black primary actions and an animated department diagram.

## AI Agent canvas — current stage

The canvas is now a single workspace without department tabs. BA, UI/UX, and Developer nodes are shown by default and reflect their chat run status. New **AI Agent** nodes display **Setup needed** until their Agent card is saved. The former Supabase data preview and LinkedIn MCP data tools have been removed. Account roles and department data remain in place.

The compact Agent team chat floats over the canvas. It controls three fixed agents: BA, UI/UX, and Developer. It can send a message to one agent or run all three in sequence with handoffs. The central MCP endpoint exposes `agent_team_list`, `agent_run`, `agent_team_run`, `agent_team_parallel_run`, and `agent_multi_run`. Use the sequential tool for role handoffs, the parallel tool when all three can work independently on one brief, and the multi-task tool for up to six independently assigned tasks in one request. Set `OPENAI_API_KEY` on the server to enable them; all three default to `gpt-5.6-luna`. `AGENT_MODEL` can override the model for all agents, while `AGENT_BA_MODEL`, `AGENT_DESIGNER_MODEL`, and `AGENT_DEVELOPER_MODEL` can override individual agents. Chat messages currently live in browser memory and disappear on refresh.

Each AI Agent node has an Agent card. Admins can edit the three built-in cards and save new cards for custom nodes. Cards are stored in PostgreSQL and supply the agent's role, mission, responsibilities, inputs, outputs, and collaboration instructions when it runs. The UI/UX card also receives the current Toolhub section of `DESIGN.md`. Saved custom agents appear in `agent_team_list` and the chat target menu, and can be called through `agent_run` and `agent_multi_run`. The built-in team-run tools still use BA → UI/UX → Developer. MCP token holders can also manage cards with `agent_card_save` and `agent_card_delete`.

External MCP clients connect to `https://<your-toolhub-domain>/api/mcp` using Streamable HTTP and an `Authorization: Bearer <MCP_SERVER_TOKEN>` header. Set a strong `MCP_SERVER_TOKEN` in the Toolhub service's Railway Variables and use the same value in the MCP client. MCP grants access to the documented Toolhub agent tools; it does not expose the OpenAI key or unrestricted access to the server or database.

The UI/UX graph now saves its nodes, links, context tags, and AI Agent configuration in PostgreSQL. Existing browser graphs are copied to the server when an admin opens the screen. Changes save after 800 ms without edits, so dragging a node does not write to the database on every pointer move. AI Agent outputs are stored separately and appear in the Output panel after a run. `designer_graph_get` reads the saved graph and outputs through MCP; `designer_graph_run_node` accepts a saved active AI Agent `node_id`, resolves only the tags referenced in its input from connected Context Builder nodes, runs the configured model, and saves its output. A Receive handoff with a test document can supply input to MCP runs; live Toolhub chat handoff data remains browser-local. The graph screen requires an admin session and the MCP tools require `MCP_SERVER_TOKEN`.

In Toolhub chat, an admin can also ask Auto or UI/UX to run the UI/UX graph from the saved Test document. This routes directly to the active AI Agent connected to a Receive handoff, displays the result in chat, and saves it to the graph Output panel. If that node has no Explicit input or connected Workflow task, the chat request supplies the task and references a small set of core Toolhub style tags from Context Builder nodes actually connected to that agent. Other chat requests still use the selected agent or team. If more than one active AI Agent receives the Test document, the chat asks for a specific node instead of choosing one silently.

The AI Agent Output panel includes a Preview tab for structured outputs containing `html`, `css`, and `js`. It combines the three files in an isolated iframe so the screen can be viewed and interacted with without publishing it. The preview blocks network requests and access to the Toolhub page; external assets and API calls in generated code will not load there.

Human Approval nodes have one input and two output ports. Connections from the upper port are labeled Approve; connections from the lower port are labeled Deny. Both branches are saved with the graph and remain visible after reload. Approval decisions and branch execution are not wired yet.

## Railway setup

In the **toolhub** service's Variables tab (not the Postgres service), configure:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Reference the Postgres service's `DATABASE_URL`, typically `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_URL` | `https://toolhub-production-958c.up.railway.app` (use the actual public app URL) |
| `BETTER_AUTH_SECRET` | Generate privately with `openssl rand -base64 32`; keep stable across deployments |
| `ADMIN_EMAIL` | `minhwuan889@gmail.com` |
| `ADMIN_PASSWORD` | A private password of 12–128 characters |
| `ADMIN_NAME` | Your display name; defaults to Admin |
| `ADMIN_DEPARTMENT` | One of the configured departments; defaults to Account |

The Dockerfile builds the app and starts `scripts/start.mjs`. Startup applies versioned SQL migrations and creates the initial admin, then starts the HTTP server. `/api/health` must return 200 for Railway's health check. Do not override the start command with a command that bypasses migrations.

After the first successful startup, remove **both `ADMIN_PASSWORD` and `ADMIN_EMAIL`** from Railway Variables and deploy the variable changes. The admin remains in PostgreSQL. Bootstrap never resets an existing admin password or promotes an existing member. If the bootstrap email is already registered and no admin exists, startup fails; resolve the account deliberately instead of overwriting it.

Push from this repository:

```sh
git push -u origin codex/initial-ui
```

Ensure Railway follows that branch. Sign in with the admin email and the password you set, then choose **Manage accounts**.

Railway passes the client IP in `X-Real-IP`. On Railway only, the app trusts that edge header for rate limiting; keep traffic behind Railway's proxy. [Railway request headers](https://docs.railway.com/networking/public-networking/specs-and-limits), [variable references](https://docs.railway.com/variables).

## Local development

Node.js 22.13+ and a reachable PostgreSQL database are required. No local database installation is needed when connecting to Railway's public database connection from a local development environment. The private Railway database hostname works only inside Railway.

```sh
npm ci
cp .env.example .env
# Fill .env privately, using a development database.
npm run db:migrate
node --env-file=.env --import tsx node_modules/vinext/dist/cli.js dev
```

Alternatively load the environment in your terminal and run `npm run dev`. Never commit `.env` or publish connection strings.

Production build (set BETTER_AUTH_URL to an HTTPS URL served by your reverse proxy; use the development server for plain localhost HTTP):

```sh
npm run build
node --env-file=.env scripts/start.mjs
```

## Account behavior

- Signup creates a Member with a required department; registration cannot assign roles.
- Signup is open in this version. Email verification, invitations, approval workflows and email password recovery are not implemented. A Member currently sees only their own account. Add an access policy before adding internal company data.
- Better Auth hashes passwords and uses HttpOnly session cookies, with Secure cookies on HTTPS. Sessions expire after seven days and are renewed during use.
- Admins can search accounts, change department/role and disable or reactivate users. Role changes and disabling revoke all target sessions.
- An admin cannot disable or demote themselves. Server-side checks and a PostgreSQL transaction serialize account updates.
- Audit records contain registration, session creation/removal, admin bootstrap and account changes. Session expiry itself is not a logout event; expired rows may remain until cleaned up.
- No administrator sees passwords or session tokens in the account list.

## Files and learning

- `lib/server/auth.ts`: Better Auth configuration and field mapping.
- `app/api`: account endpoints and server authorization.
- `lib/server/admin-users.ts`: parameterized SQL transaction for admin changes.
- `db/migrations`: versioned schema; never edit applied migrations.
- `POSTGRES-LEARNING.md`: tables and SQL exercises.
- `AUTH-UX.md`: current behavior.
- `VALIDATION.md`: checks and limitations.

## Tests

Use a dedicated empty test database, never production. The test inserts accounts and clears rate-limit records.

```sh
TEST_DATABASE_URL='your-private-test-connection-string' npm run test:auth
npx tsc --noEmit
npm run build
```

Production data persists in Railway's Postgres volume across app redeployments. Manage backups in Railway separately.
