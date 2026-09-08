# Learn PostgreSQL with Toolhub

The browser talks to the app's API. Only the backend connects to PostgreSQL using `DATABASE_URL`. You do not need to install PostgreSQL on your computer when Railway hosts it.

## 1. Find your tables

Open Railway → Postgres → Database and inspect the tables after the new app starts successfully. If you use a SQL client locally, connect through Railway's public connection configuration, keeping the password private. The queries below run in a SQL client such as psql.

| Table | What you learn |
|---|---|
| `users` | Account profile, department, role and disabled state |
| `accounts` | Library-managed password hashes; never plaintext passwords |
| `sessions` | Persisted login sessions and expiry |
| `departments` | Seven allowed values referenced by users |
| `auth_events` | Registration, session and admin-change history |
| `schema_migrations` | Which versioned SQL files have been applied |
| `rate_limits` | Request counters used to limit repeated auth attempts |
| `verification_tokens` | Library schema reserved for future verification flows |

The app's `admin` role is a column value in `users`. It is different from a PostgreSQL server/database role.

## 2. Read accounts

```sql
SELECT id, name, email, department, role, banned, created_at
FROM users
ORDER BY created_at DESC;
```

Sign up once in the app and run this again. A new row should appear with `role = 'user'`.

## 3. Group by department

```sql
SELECT d.name, COUNT(u.id) AS account_count
FROM departments AS d
LEFT JOIN users AS u ON u.department = d.name
GROUP BY d.name
ORDER BY d.name;
```

The foreign key ensures each user's department exists in the department table.

## 4. See sessions without exposing tokens

```sql
SELECT u.email, s.created_at, s.expires_at
FROM sessions AS s
JOIN users AS u ON u.id = s.user_id
WHERE s.expires_at > now()
ORDER BY s.created_at DESC;
```

Sign in, refresh the app, then sign out. Refresh keeps the session; sign-out deletes that session. Admin disabling removes all sessions for that account.

## 5. Inspect the audit trail

```sql
SELECT e.created_at, e.event, target.email AS account,
       actor.email AS changed_by, e.details
FROM auth_events AS e
LEFT JOIN users AS target ON target.id = e.user_id
LEFT JOIN users AS actor ON actor.id = e.actor_id
ORDER BY e.created_at DESC
LIMIT 50;
```

## 6. Practice rollback on a development database

```sql
BEGIN;
UPDATE users SET department = 'HR'
WHERE email = 'practice@example.com';
SELECT email, department FROM users WHERE email = 'practice@example.com';
ROLLBACK;
```

Replace the email with a test account. `ROLLBACK` cancels the transaction. Use the admin UI for real account changes so role checks, session revocation and audit details are applied together. Avoid editing password hashes or session tokens by hand.

## 7. Understand migrations

```sql
SELECT name, applied_at FROM schema_migrations ORDER BY name;
```

Startup applies new SQL files once. Existing files are checked by checksum; schema changes should use a new numbered migration. A failed migration is rolled back rather than partly applied.
