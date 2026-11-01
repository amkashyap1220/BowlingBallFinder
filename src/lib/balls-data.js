/* ==========================================================================
   The ball list's data file (data/balls.csv): reading it, checking it, and
   turning it into SQL for a seed migration.

   Pure functions, no files or database: scripts/balls-sql.mjs writes the
   migration, and the tests use the same functions to check the data and
   that the migration is up to date.
   ========================================================================== */

/** The CSV's columns, in order. Same names as the balls table. */
export const COLUMNS = [
  "brand", "name", "line", "release_date", "core_name", "core_type",
  "rg", "differential", "mass_bias", "coverstock_name", "coverstock_type",
  "surface", "surface_grit", "finish", "status", "source_url", "notes",
];

const NUMBERS = new Set(["rg", "differential", "mass_bias", "surface_grit"]);

export const CORE_TYPES = ["symmetric", "asymmetric"];
export const COVER_TYPES = ["solid", "pearl", "hybrid", "urethane", "polyester"];
export const FINISHES = ["sanded", "polished"];
export const STATUSES = ["current", "discontinued"];

/** Splits CSV text into rows of strings. Handles "quoted, fields" and "" inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f !== ""));
}

/**
 * The balls in the CSV as objects (empty cells become null, numbers become
 * numbers). Throws on a wrong header.
 */
export function readBalls(text) {
  const [header, ...rows] = parseCsv(text);
  if (header?.join(",") !== COLUMNS.join(",")) {
    throw new Error(`data/balls.csv: the header must be exactly: ${COLUMNS.join(",")}`);
  }
  return rows.map((cells) => {
    const ball = {};
    COLUMNS.forEach((col, i) => {
      const v = (cells[i] ?? "").trim();
      ball[col] = v === "" ? null : NUMBERS.has(col) ? Number(v) : v;
    });
    return ball;
  });
}

/** Everything wrong with the data, as readable lines (empty when it's fine). */
export function checkBalls(balls) {
  const problems = [];
  const seen = new Set();
  balls.forEach((b, i) => {
    const at = `row ${i + 2} (${b.brand} ${b.name})`;
    const bad = (msg) => problems.push(`${at}: ${msg}`);
    if (!b.brand || !b.name) bad("brand and name are required");
    const key = `${b.brand}|${b.name}`.toLowerCase();
    if (seen.has(key)) bad("appears twice");
    seen.add(key);
    if (!CORE_TYPES.includes(b.core_type)) bad(`core_type must be one of ${CORE_TYPES.join(", ")}`);
    if (!COVER_TYPES.includes(b.coverstock_type)) bad(`coverstock_type must be one of ${COVER_TYPES.join(", ")}`);
    if (!FINISHES.includes(b.finish)) bad(`finish must be one of ${FINISHES.join(", ")}`);
    if (!STATUSES.includes(b.status)) bad(`status must be one of ${STATUSES.join(", ")}`);
    if (!(b.rg >= 2.4 && b.rg <= 2.7)) bad("rg should be between 2.40 and 2.70");
    if (!(b.differential >= 0 && b.differential <= 0.08)) bad("differential should be between 0 and 0.080");
    if (b.mass_bias !== null && !(b.mass_bias >= 0 && b.mass_bias <= 0.03)) bad("mass_bias should be between 0 and 0.030");
    if (b.core_type === "symmetric" && b.mass_bias) bad("a symmetric core has no mass bias");
    if (b.surface_grit !== null && !Number.isInteger(b.surface_grit)) bad("surface_grit must be a whole number");
    if (b.release_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(b.release_date)) bad("release_date must be YYYY-MM-DD");
    if (!/^https:\/\/\S+$/.test(b.source_url ?? "")) bad("source_url must be the maker's https:// page");
  });
  return problems;
}

const literal = (v) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/**
 * SQL that adds every ball, or updates it when brand + name already exist,
 * so a later seed migration can correct numbers. A migration file can't use
 * bound parameters, so values are written as escaped SQL literals here; this
 * runs at build time on the reviewed CSV, never on anything from a request.
 */
export function seedSql(balls, header = "") {
  const cols = COLUMNS.join(", ");
  const updates = COLUMNS.filter((c) => c !== "brand" && c !== "name").map((c) => `${c} = excluded.${c}`).join(", ");
  const lines = balls.map((b) => `INSERT INTO balls (${cols}) VALUES (${COLUMNS.map((c) => literal(b[c])).join(", ")})\n  ON CONFLICT (brand, name) DO UPDATE SET ${updates};`);
  return header + lines.join("\n") + "\n";
}
