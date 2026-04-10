import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const poolConnection = mysql.createPool({
  uri: process.env.DATABASE_URL || "mysql://root:password@127.0.0.1:3306/teamflow",
});

export const db = drizzle(poolConnection, { schema, mode: 'default' });
