import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Cache the pool on globalThis to survive Next.js dev hot reloads.
// Without this, every hot reload creates a new pool (5 connections)
// while old pools aren't garbage collected — exhausting MySQL's max_connections.
const globalForDb = globalThis as unknown as {
  _dbPool?: mysql.Pool;
};

if (!globalForDb._dbPool) {
  globalForDb._dbPool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 50,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });
}

export const db = drizzle(globalForDb._dbPool, { schema, mode: "default" });
