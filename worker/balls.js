/* ==========================================================================
   The ball list (the balls table, migrations/0002_balls.sql).

     GET /api/balls        every ball, filtered by the query string:
                             brand=Storm         (repeat for several brands)
                             cover=solid|pearl|hybrid|urethane|polyester
                             core=symmetric|asymmetric
                             after=YYYY-MM-DD    released on or after this date
     GET /api/balls/:id    one ball

   The list is the same for everyone: nothing here depends on who's asking.
   ========================================================================== */

import { json } from "./api.js";
import { CORE_TYPES, COVER_TYPES } from "../src/lib/balls-data.js";

const FIELDS = `id, brand, name, line, release_date, core_name, core_type, rg, differential, mass_bias,
  coverstock_name, coverstock_type, surface, surface_grit, finish, status, source_url, notes`;

/** The shape the API sends: camelCase, like /api/me. */
export function toBall(row) {
  return {
    id: row.id,
    brand: row.brand,
    name: row.name,
    line: row.line,
    releaseDate: row.release_date,
    core: { name: row.core_name, type: row.core_type },
    rg: row.rg,
    differential: row.differential,
    massBias: row.mass_bias,
    coverstock: { name: row.coverstock_name, type: row.coverstock_type },
    surface: { text: row.surface, grit: row.surface_grit, finish: row.finish },
    status: row.status,
    sourceUrl: row.source_url,
    notes: row.notes,
  };
}

/**
 * Reads the filters from a query string, or says what's wrong with them.
 * @returns {{ ok: true, filters: object } | { ok: false, error: string }}
 */
export function readFilters(params) {
  const brands = params.getAll("brand").map((b) => b.trim()).filter(Boolean);
  const cover = params.get("cover") || null;
  const core = params.get("core") || null;
  const after = params.get("after") || null;
  if (cover && !COVER_TYPES.includes(cover)) return { ok: false, error: `cover must be one of: ${COVER_TYPES.join(", ")}` };
  if (core && !CORE_TYPES.includes(core)) return { ok: false, error: `core must be one of: ${CORE_TYPES.join(", ")}` };
  if (after && !/^\d{4}-\d{2}-\d{2}$/.test(after)) return { ok: false, error: "after must be a date like 2025-01-31" };
  return { ok: true, filters: { brands, cover, core, after } };
}

/**
 * The balls matching the filters, by brand then name.
 * @param {D1Database} db
 */
export async function listBalls(db, { brands = [], cover = null, core = null, after = null } = {}) {
  const where = [];
  const values = [];
  const param = (v) => {
    values.push(v);
    return `?${values.length}`;
  };
  if (brands.length) where.push(`brand COLLATE NOCASE IN (${brands.map(param).join(", ")})`);
  if (cover) where.push(`coverstock_type = ${param(cover)}`);
  if (core) where.push(`core_type = ${param(core)}`);
  // A ball with no known release date can't be shown to be newer, so it's left out
  if (after) where.push(`release_date >= ${param(after)}`);
  const sql = `SELECT ${FIELDS} FROM balls ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY brand, name`;
  const { results } = await db.prepare(sql).bind(...values).all();
  return results;
}

/** One ball, or null. */
export async function getBall(db, id) {
  return db.prepare(`SELECT ${FIELDS} FROM balls WHERE id = ?1`).bind(id).first();
}

export async function ballsRoute(request, env) {
  const read = readFilters(new URL(request.url).searchParams);
  if (!read.ok) return json({ error: read.error }, 400);
  const rows = await listBalls(env.DB, read.filters);
  return json({ balls: rows.map(toBall) });
}

export async function ballRoute(request, env, email, { id }) {
  if (!/^\d+$/.test(id)) return json({ error: "Not found" }, 404);
  const row = await getBall(env.DB, Number(id));
  return row ? json({ ball: toBall(row) }) : json({ error: "Not found" }, 404);
}
