/**
 * One-shot: if the DB already has schema from push/seed but no drizzle journal,
 * stamp 0000 as applied, then run remaining migrations (0001 drops auth-era tables).
 */
import { createHash } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const drizzleDir = join(__dirname, "..", "drizzle");
const client = createClient({ url });

function hashSql(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function migrationFiles() {
  return readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      tag: f.replace(/\.sql$/, ""),
      sql: readFileSync(join(drizzleDir, f), "utf8"),
    }));
}

async function main() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);

  const applied = await client.execute(`SELECT hash FROM __drizzle_migrations`);
  const appliedHashes = new Set(applied.rows.map((r) => r.hash));

  const tables = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  );
  const tableNames = new Set(tables.rows.map((r) => r.name));
  console.log("tables:", [...tableNames].join(", "));

  const migrations = migrationFiles();
  for (const m of migrations) {
    const hash = hashSql(m.sql);
    if (appliedHashes.has(hash)) {
      console.log(`skip ${m.tag} (already applied)`);
      continue;
    }

    // Baseline already present from prior push — stamp without re-running CREATEs
    if (m.tag.startsWith("0000_") && tableNames.has("user") && tableNames.has("jobs")) {
      await client.execute({
        sql: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
        args: [hash, Date.now()],
      });
      appliedHashes.add(hash);
      console.log(`stamped ${m.tag} (schema already present)`);
      continue;
    }

    const statements = m.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      await client.execute(stmt);
    }
    await client.execute({
      sql: `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`,
      args: [hash, Date.now()],
    });
    console.log(`applied ${m.tag}`);
  }

  const userCheck = await client.execute(`SELECT id, email FROM user LIMIT 5`);
  console.log("user rows:", userCheck.rows);

  const after = await client.execute(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`
  );
  console.log(
    "tables after:",
    after.rows.map((r) => r.name).join(", ")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
