# Railway MySQL Connection Management

Guide for managing MySQL connection limits on Railway.app for TeamFlow.

---

## The Problem

Railway's MySQL default `max_connections` is ~151, but on hobby/pro plans the actual limit can be lower due to resource constraints. When the app opens more connections than MySQL allows, you get:

```
Error: Too many connections (ER_CON_COUNT_ERROR, errno 1040)
```

This manifests as auth failures (JWT callback can't query), page load errors, and API timeouts.

---

## How to Increase max_connections on Railway

**Important:** The `MYSQLD_MAX_CONNECTIONS` environment variable does NOT work. Railway's MySQL Docker image does not read it.

### Correct method: Custom Start Command

1. Go to your **MySQL service** on Railway dashboard
2. Click the **Settings** tab
3. Find **Custom Start Command**
4. Set it to:
   ```
   docker-entrypoint.sh mysqld --max_connections=100
   ```
5. Click **Deploy** or restart the service

Adjust `100` to your desired limit (50, 100, 200, etc.).

This passes the flag directly to the MySQL server process and **persists across deploys**.

### Verify it worked

After the MySQL service restarts, you can verify by running:

```sql
SHOW VARIABLES LIKE 'max_connections';
```

Or from the app:

```bash
node -e "
const mysql = require('mysql2/promise');
require('dotenv/config');
async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute('SHOW VARIABLES LIKE \"max_connections\"');
  console.log(rows[0]);
  await conn.end();
}
run();
"
```

---

## App-Side Connection Pool

TeamFlow limits its own connection pool in `src/lib/db/index.ts`:

```typescript
const poolConnection = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 50,
});
```

| Setting | Value | Meaning |
|---------|-------|---------|
| `connectionLimit` | 5 | Max 5 simultaneous connections from the app |
| `waitForConnections` | true | Queue requests if all connections busy |
| `queueLimit` | 50 | Max 50 queued requests before rejecting |

### Why 5?

- Railway hobby/pro plan MySQL can handle ~50-100 connections
- The app uses a single pool shared across all API routes
- 5 connections handles typical load (2-3 concurrent users)
- The JWT DB check is throttled to every 60 seconds (not per-request) to reduce connection pressure
- If needed, increase to 10 in `src/lib/db/index.ts`

---

## Troubleshooting

### "Too many connections" errors

1. **Check MySQL max_connections** — may need to increase via Custom Start Command
2. **Restart MySQL service** on Railway — clears all stuck/zombie connections
3. **Restart app service** — creates a fresh connection pool
4. **Check for connection leaks** — every `db.select/insert/update` automatically returns connections to the pool via Drizzle ORM. Manual `mysql2` connections (in scripts) must call `conn.end()`.

### JWT auth errors (JWTSessionError)

The JWT callback in `auth.config.ts` checks user role/status from the DB every 60 seconds. If MySQL is down or connections are exhausted:
- The check fails silently (try-catch) and keeps the existing token data
- Users can still browse with their cached role for up to 60 seconds
- Once MySQL recovers, the next check succeeds

### After Railway MySQL restart

MySQL restart drops all connections. The app's connection pool automatically reconnects on the next query — no app restart needed. However, if errors persist for more than 30 seconds, restart the app service too.

---

## References

- [Railway: Increase MySQL max_connections](https://station.railway.com/questions/increase-my-sql-max-connections-d5b09e10)
- [MySQL: Too Many Connections](https://dev.mysql.com/doc/refman/8.4/en/too-many-connections.html)
