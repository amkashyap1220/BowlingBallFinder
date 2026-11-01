/* ==========================================================================
   The people who use the app (the users table, migrations/0001_users.sql).

   A row is created the first time someone signs in; after that, each visit
   to /api/me updates last_seen_at. Every other table that holds someone's
   data points at users.id.
   ========================================================================== */

/**
 * The signed-in person's row, created on their first visit.
 * @param {D1Database} db
 * @param {string} email  already checked and lowercased by access.js
 * @returns {Promise<{ id: number, email: string, name: string | null, created_at: string, last_seen_at: string }>}
 */
export async function upsertUser(db, email) {
  return db
    .prepare(
      `INSERT INTO users (email, last_seen_at) VALUES (?1, datetime('now'))
       ON CONFLICT (email) DO UPDATE SET last_seen_at = excluded.last_seen_at
       RETURNING id, email, name, created_at, last_seen_at`,
    )
    .bind(email)
    .first();
}
