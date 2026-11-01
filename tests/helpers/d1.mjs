// A stand-in for Cloudflare D1 in tests: an in-memory SQLite database (Node's
// built-in node:sqlite) with every file in migrations/ applied, behind the
// parts of D1's API the Worker uses: prepare().bind().first() / .all() / .run(),
// and batch().
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.join(import.meta.dirname, "..", "..", "migrations");

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  // D1's ?1, ?2 placeholders work in SQLite as-is
  async first(column) {
    const row = this.db.prepare(this.sql).get(...this.params) ?? null;
    return column && row ? row[column] : row;
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.params), success: true };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function testDb() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
  }
  return {
    raw: db,
    prepare: (sql) => new Statement(db, sql),
    batch: async (statements) => Promise.all(statements.map((s) => s.all())),
  };
}
