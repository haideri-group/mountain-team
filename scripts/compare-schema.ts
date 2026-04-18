/**
 * READ-ONLY deep schema audit. Compares drizzle (src/lib/db/schema.ts)
 * against the live MySQL DB via information_schema. Never mutates.
 *
 * Per-column checks: name, type (with length/precision), nullability,
 * default. Also checks primary key columns, foreign keys, secondary
 * indexes (by name + column composition).
 *
 * Usage: yarn tsx scripts/compare-schema.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import * as schema from "../src/lib/db/schema";
import { getTableConfig } from "drizzle-orm/mysql-core";
import type { MySqlColumn } from "drizzle-orm/mysql-core";

type DbColumn = {
  column: string;
  nullable: "YES" | "NO";
  type: string; // COLUMN_TYPE, e.g. "varchar(191)", "tinyint(1)", "enum('a','b')"
  default: string | null;
  extra: string;
  key: string;
};

type DbIndex = { name: string; column: string; nonUnique: number; seq: number };
type DbFk = { name: string; column: string; refTable: string; refColumn: string };

// Map a drizzle column to the COLUMN_TYPE string MySQL reports.
function expectedMysqlType(col: MySqlColumn): string {
  const ct = col.columnType;
  // Drizzle's MySQL column type constants — covering what this codebase uses.
  switch (ct) {
    case "MySqlVarChar": {
      const len = (col as unknown as { length?: number }).length ?? 255;
      return `varchar(${len})`;
    }
    case "MySqlText":
      return "text";
    case "MySqlTimestamp":
      return "timestamp";
    case "MySqlInt":
      return "int";
    case "MySqlBoolean":
      return "tinyint(1)";
    case "MySqlFloat":
      return "float";
    case "MySqlEnumColumn": {
      const vals = (col as unknown as { enumValues?: readonly string[] }).enumValues ?? [];
      return `enum(${vals.map((v) => `'${v}'`).join(",")})`;
    }
    case "MySqlDouble":
      return "double";
    case "MySqlDecimal":
      return "decimal";
    default:
      return `UNKNOWN(${ct})`;
  }
}

// Normalize a "default" string for comparison. DB returns things like
// "CURRENT_TIMESTAMP" or null. Drizzle emits defaults in several forms.
function normalizeDefault(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "<null>";
  const s = String(raw).trim();
  if (s === "") return "<empty>";
  // MySQL returns "CURRENT_TIMESTAMP" for now() defaults
  if (/^current_timestamp$/i.test(s)) return "now()";
  if (/^now\(\)$/i.test(s)) return "now()";
  // Strip wrapping parens drizzle sometimes adds
  const unwrapped = s.replace(/^\((.*)\)$/, "$1").trim();
  if (/^current_timestamp$/i.test(unwrapped)) return "now()";
  // Booleans come back as "0" / "1"
  if (s === "0") return "false";
  if (s === "1") return "true";
  return s;
}

function drizzleDefault(col: MySqlColumn): string {
  const raw = (col as unknown as { default?: unknown; hasDefault?: boolean }).default;
  if (!("hasDefault" in col) || !(col as unknown as { hasDefault?: boolean }).hasDefault) {
    return "<null>";
  }
  if (raw === undefined || raw === null) return "<null>";
  if (typeof raw === "object" && raw !== null && "queryChunks" in (raw as object)) {
    // sql`...` expression like sql`now()` or sql`CURRENT_TIMESTAMP`
    return "now()";
  }
  if (typeof raw === "boolean") return raw ? "true" : "false";
  return String(raw);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [[{ schemaName }]] = (await conn.query("SELECT DATABASE() AS schemaName")) as [
    [{ schemaName: string }],
    unknown,
  ];
  console.log(`Target database: ${schemaName}\n`);

  // --- Gather drizzle tables ---
  const drizzleTables: Record<
    string,
    {
      columns: MySqlColumn[];
      indexes: { name: string; columns: string[]; unique: boolean }[];
      fks: { name: string; column: string; refTable: string; refColumn: string }[];
      pk: string[];
    }
  > = {};
  for (const v of Object.values(schema)) {
    if (typeof v !== "object" || v === null) continue;
    try {
      const cfg = getTableConfig(v as never);
      drizzleTables[cfg.name] = {
        columns: cfg.columns as MySqlColumn[],
        indexes: cfg.indexes.map((i) => {
          const ic = i.config as unknown as { name?: string; columns?: unknown[]; unique?: boolean };
          const cols = (ic.columns ?? []).map((c) => (c as { name?: string }).name ?? "?");
          return { name: ic.name ?? "?", columns: cols, unique: !!ic.unique };
        }),
        fks: cfg.foreignKeys.map((fk) => {
          const ref = fk.reference();
          const refTbl = getTableConfig(ref.foreignTable as never).name;
          return {
            name: fk.getName(),
            column: ref.columns[0].name,
            refTable: refTbl,
            refColumn: ref.foreignColumns[0].name,
          };
        }),
        pk: cfg.primaryKeys.flatMap((p) =>
          (p.columns as { name: string }[]).map((c) => c.name),
        ),
      };
    } catch {
      /* not a table */
    }
  }

  // --- DB tables ---
  const [dbTablesRows] = await conn.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name",
    [schemaName],
  );
  const dbTables = new Set(
    (dbTablesRows as { TABLE_NAME?: string; table_name?: string }[]).map(
      (r) => (r.TABLE_NAME ?? r.table_name ?? "").toString(),
    ),
  );

  const drizzleNames = new Set(Object.keys(drizzleTables));
  const inBoth = [...drizzleNames].filter((t) => dbTables.has(t)).sort();
  const onlyDrizzle = [...drizzleNames].filter((t) => !dbTables.has(t)).sort();
  const onlyDb = [...dbTables].filter((t) => !drizzleNames.has(t)).sort();

  let totalDiffs = 0;

  if (onlyDrizzle.length) {
    console.log("[!] Tables in schema.ts but NOT in DB:");
    onlyDrizzle.forEach((t) => {
      console.log(`    - ${t}`);
      totalDiffs += 1;
    });
    console.log();
  }
  if (onlyDb.length) {
    console.log("[!] Tables in DB but NOT in schema.ts:");
    onlyDb.forEach((t) => {
      console.log(`    - ${t}`);
      totalDiffs += 1;
    });
    console.log();
  }

  // --- Per-table deep comparison ---
  for (const table of inBoth) {
    const dz = drizzleTables[table];

    // Columns from DB
    const [colRows] = await conn.query(
      "SELECT column_name AS `column`, is_nullable AS nullable, column_type AS type, column_default AS `default`, extra, column_key AS `key` FROM information_schema.columns WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position",
      [schemaName, table],
    );
    const dbCols = colRows as DbColumn[];
    const dbByName = new Map(dbCols.map((c) => [c.column, c]));

    // Indexes
    const [idxRows] = await conn.query(
      "SELECT index_name AS `name`, column_name AS `column`, non_unique AS nonUnique, seq_in_index AS seq FROM information_schema.statistics WHERE table_schema = ? AND table_name = ? ORDER BY index_name, seq_in_index",
      [schemaName, table],
    );
    const idxData = idxRows as DbIndex[];
    const dbPkCols = idxData.filter((r) => r.name === "PRIMARY").map((r) => r.column);
    const dbIndexes = new Map<string, { columns: string[]; unique: boolean }>();
    for (const r of idxData) {
      if (r.name === "PRIMARY") continue;
      const prev = dbIndexes.get(r.name);
      if (!prev) {
        dbIndexes.set(r.name, { columns: [r.column], unique: r.nonUnique === 0 });
      } else {
        prev.columns.push(r.column);
      }
    }

    // FKs
    const [fkRows] = await conn.query(
      "SELECT constraint_name AS name, column_name AS `column`, referenced_table_name AS refTable, referenced_column_name AS refColumn FROM information_schema.key_column_usage WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL",
      [schemaName, table],
    );
    const dbFks = fkRows as DbFk[];

    const issues: string[] = [];

    // Per-column check
    const dzColNames = new Set<string>();
    for (const col of dz.columns) {
      dzColNames.add(col.name);
      const dbCol = dbByName.get(col.name);
      if (!dbCol) {
        issues.push(`column missing in DB: ${col.name}`);
        continue;
      }

      const expType = expectedMysqlType(col).toLowerCase();
      const actType = dbCol.type.toLowerCase();
      if (expType !== actType) {
        issues.push(`${col.name}: type mismatch — schema=${expType}  db=${actType}`);
      }

      const expNull = (col as unknown as { notNull?: boolean }).notNull ? "NO" : "YES";
      if (expNull !== dbCol.nullable) {
        issues.push(`${col.name}: nullability mismatch — schema=${expNull === "NO" ? "NOT NULL" : "NULL"}  db=${dbCol.nullable === "NO" ? "NOT NULL" : "NULL"}`);
      }

      const expDef = normalizeDefault(drizzleDefault(col));
      const actDef = normalizeDefault(dbCol.default);
      if (expDef !== actDef) {
        issues.push(`${col.name}: default mismatch — schema=${expDef}  db=${actDef}`);
      }
    }
    // Extra columns in DB
    for (const dbCol of dbCols) {
      if (!dzColNames.has(dbCol.column)) {
        issues.push(`column in DB but NOT in schema.ts: ${dbCol.column}`);
      }
    }

    // Primary key
    const dzPkSet = new Set(dz.pk);
    const singleColPks = dz.columns.filter((c) => (c as unknown as { primary?: boolean }).primary).map((c) => c.name);
    const expectedPk = new Set([...dzPkSet, ...singleColPks]);
    const actualPk = new Set(dbPkCols);
    if (expectedPk.size !== actualPk.size || [...expectedPk].some((c) => !actualPk.has(c))) {
      issues.push(`PK mismatch — schema=[${[...expectedPk].join(",")}]  db=[${[...actualPk].join(",")}]`);
    }

    // Indexes (secondary) — compare by name and column order
    const dzIdxMap = new Map(dz.indexes.map((i) => [i.name, i]));
    for (const [name, dzIdx] of dzIdxMap) {
      const dbIdx = dbIndexes.get(name);
      if (!dbIdx) {
        issues.push(`index missing in DB: ${name} (${dzIdx.columns.join(",")})`);
        continue;
      }
      if (dzIdx.columns.join(",") !== dbIdx.columns.join(",")) {
        issues.push(`index ${name}: column composition differs — schema=[${dzIdx.columns.join(",")}]  db=[${dbIdx.columns.join(",")}]`);
      }
    }
    for (const [name, dbIdx] of dbIndexes) {
      if (!dzIdxMap.has(name)) {
        // Uniqueness inferred from .unique() on drizzle columns isn't surfaced here;
        // drizzle emits unique CONSTRAINTs with auto-generated names like `<table>_<col>_unique`.
        // Only flag if it's non-unique (those are true secondary indexes drizzle doesn't know about).
        if (dbIdx.unique) continue;
        issues.push(`index in DB but NOT in schema.ts: ${name} (${dbIdx.columns.join(",")})`);
      }
    }

    // FKs
    const dzFkMap = new Map(dz.fks.map((f) => [f.name, f]));
    for (const [name, dzFk] of dzFkMap) {
      const dbFk = dbFks.find((f) => f.name === name);
      if (!dbFk) {
        issues.push(`FK missing in DB: ${name}`);
        continue;
      }
      if (dbFk.column !== dzFk.column || dbFk.refTable !== dzFk.refTable || dbFk.refColumn !== dzFk.refColumn) {
        issues.push(`FK ${name}: mismatch — schema=${dzFk.column}->${dzFk.refTable}.${dzFk.refColumn}  db=${dbFk.column}->${dbFk.refTable}.${dbFk.refColumn}`);
      }
    }
    for (const dbFk of dbFks) {
      if (!dzFkMap.has(dbFk.name)) {
        issues.push(`FK in DB but NOT in schema.ts: ${dbFk.name}`);
      }
    }

    if (issues.length === 0) {
      console.log(`[OK] ${table}  (${dbCols.length} cols, ${dbIndexes.size} idx, ${dbFks.length} fk)`);
    } else {
      totalDiffs += issues.length;
      console.log(`[DIFF] ${table}`);
      issues.forEach((i) => console.log(`       • ${i}`));
    }
  }

  await conn.end();

  console.log();
  console.log(
    totalDiffs === 0
      ? "Schema and DB are in full sync (columns, types, nullability, defaults, PKs, FKs, indexes)."
      : `Found ${totalDiffs} differences (see above).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
