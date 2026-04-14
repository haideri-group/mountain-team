import { drizzle } from "drizzle-orm/mysql2";
import mysql, { Pool } from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Singleton pool — Next.js re-evaluates modules on every request in development
// and can import the same module multiple times across server instances. Storing
// the pool on `globalThis` ensures a single Pool is reused across all imports,
// preventing connection accumulation and "too many connections" errors.
declare global {
  // eslint-disable-next-line no-var
  var _mysqlPool: Pool | undefined;
}

if (!globalThis._mysqlPool) {
  globalThis._mysqlPool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 50,
  });
}

const poolConnection = globalThis._mysqlPool;

export const db = drizzle(poolConnection, { schema, mode: "default" });
