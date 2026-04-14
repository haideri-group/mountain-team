import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const poolConnection = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 50,
});

export const db = drizzle(poolConnection, { schema, mode: "default" });
