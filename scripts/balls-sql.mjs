// Turns data/balls.csv into the seed migration that loads it into the
// database:   npm run balls:sql
//
// The CSV is the reviewed source; the migration is generated from it so a
// change to the data is a readable diff in both. Writes the newest seed
// migration, migrations/0003_balls_seed.sql. Once that file has shipped,
// change SEED_FILE to the next number first (migrations are never edited
// after they ship; every seed adds-or-updates by brand + name, so a new one
// can carry the whole CSV again).
import fs from "node:fs";
import path from "node:path";
import { readBalls, checkBalls, seedSql } from "../src/lib/balls-data.js";

const ROOT = path.join(import.meta.dirname, "..");
export const CSV_FILE = path.join(ROOT, "data", "balls.csv");
export const SEED_FILE = path.join(ROOT, "migrations", "0003_balls_seed.sql");
export const HEADER =
  "-- Generated from data/balls.csv by `npm run balls:sql`. Don't edit by hand:\n" +
  "-- change the CSV and run the script again.\n\n";

export function buildSeed() {
  const balls = readBalls(fs.readFileSync(CSV_FILE, "utf8"));
  const problems = checkBalls(balls);
  if (problems.length) throw new Error("data/balls.csv has problems:\n  " + problems.join("\n  "));
  return { balls, sql: seedSql(balls, HEADER) };
}

if (process.argv[1] === import.meta.filename) {
  try {
    const { balls, sql } = buildSeed();
    fs.writeFileSync(SEED_FILE, sql);
    console.log(`Wrote ${path.relative(ROOT, SEED_FILE)} with ${balls.length} balls.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
