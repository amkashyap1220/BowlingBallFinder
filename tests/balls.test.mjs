// The ball list: the data file, the seed migration made from it, the table,
// the filters, and the API routes
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker from "../worker/index.js";
import { listBalls, getBall, readFilters } from "../worker/balls.js";
import { parseCsv, readBalls, checkBalls, seedSql } from "../src/lib/balls-data.js";
import { buildSeed, SEED_FILE } from "../scripts/balls-sql.mjs";
import { testDb } from "./helpers/d1.mjs";
import { makeSigner, stubCerts, claimsFor, settings } from "./helpers/access.mjs";

const { balls: csvBalls } = buildSeed();

/* ---------- The data file ---------- */

test("data/balls.csv has no problems and at least 40 balls", () => {
  assert.deepEqual(checkBalls(csvBalls), []);
  assert.ok(csvBalls.length >= 40, `only ${csvBalls.length} balls`);
});

test("every ball says where its specs came from: the maker's own site", () => {
  const makerSites = /^https:\/\/(www\.)?(stormbowling|hammerbowling|trackbowling|ebonite|columbia300|brunswickbowling|dv8bowling|radicalbowling|motivbowling)\.com\//;
  for (const b of csvBalls) assert.match(b.source_url, makerSites, `${b.brand} ${b.name}`);
});

test("the brands the plan asks for are all there", () => {
  const brands = new Set(csvBalls.map((b) => b.brand));
  for (const b of ["Storm", "Roto Grip", "900 Global", "Brunswick", "Hammer", "Ebonite", "DV8", "Radical", "Track", "Motiv", "Columbia 300"]) {
    assert.ok(brands.has(b), b);
  }
});

test("the seed migration is up to date with data/balls.csv (run npm run balls:sql)", () => {
  assert.equal(fs.readFileSync(SEED_FILE, "utf8"), buildSeed().sql);
});

test("the CSV reader handles quotes, commas and blank cells", () => {
  assert.deepEqual(parseCsv('a,b,c\n"x, y","say ""hi""",\r\n'), [["a", "b", "c"], ["x, y", 'say "hi"', ""]]);
  assert.throws(() => readBalls("brand,name\nStorm,X\n"), /header/);
});

test("the data check catches wrong values", () => {
  const good = csvBalls[0];
  const problems = checkBalls([
    { ...good, rg: 3.1 },
    { ...good, name: "Two", core_type: "symmetric", mass_bias: 0.01 },
    { ...good, name: "Three", source_url: "http://example.com" },
    { ...good, name: "Four", release_date: "10/04/16" },
    { ...good, name: "Four" },
  ]);
  assert.equal(problems.length, 5, problems.join("\n"));
});

test("seed SQL escapes quotes in names", () => {
  const sql = seedSql([{ ...csvBalls[0], name: "Rock'n Roll" }]);
  assert.match(sql, /'Rock''n Roll'/);
});

/* ---------- The table ---------- */

test("the migrations load every ball from the CSV", () => {
  const db = testDb();
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM balls").get().n, csvBalls.length);
  const phaze = db.raw.prepare("SELECT * FROM balls WHERE brand = 'Storm' AND name = 'Phaze II'").get();
  assert.equal(phaze.rg, 2.48);
  assert.equal(phaze.differential, 0.051);
  assert.equal(phaze.mass_bias, null);
  assert.equal(phaze.coverstock_type, "solid");
});

test("running the seed again updates balls instead of duplicating them", () => {
  const db = testDb();
  const changed = csvBalls.map((b) => (b.name === "Phaze II" ? { ...b, rg: 2.49 } : b));
  db.raw.exec(seedSql(changed));
  assert.equal(db.raw.prepare("SELECT count(*) AS n FROM balls").get().n, csvBalls.length);
  assert.equal(db.raw.prepare("SELECT rg FROM balls WHERE name = 'Phaze II'").get().rg, 2.49);
});

test("the table refuses impossible values", () => {
  const db = testDb();
  const insert = (over) => {
    const b = { brand: "Test", name: "Ball", core_type: "symmetric", rg: 2.5, differential: 0.04, coverstock_type: "solid", finish: "sanded", source_url: "https://example.com", ...over };
    const cols = Object.keys(b);
    db.raw.prepare(`INSERT INTO balls (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(...Object.values(b));
  };
  insert({});
  assert.throws(() => insert({ name: "Two", core_type: "round" }), /CHECK/);
  assert.throws(() => insert({ name: "Three", rg: 3 }), /CHECK/);
  assert.throws(() => insert({ name: "Four", source_url: "ftp://x" }), /CHECK/);
  assert.throws(() => insert({}), /UNIQUE/);
});

/* ---------- Filters ---------- */

test("filters: brand, cover, core, released after", async () => {
  const db = testDb();
  const all = await listBalls(db);
  assert.equal(all.length, csvBalls.length);

  const storm = await listBalls(db, { brands: ["storm"] });
  assert.ok(storm.length > 0 && storm.every((b) => b.brand === "Storm"));
  const two = await listBalls(db, { brands: ["Storm", "Motiv"] });
  assert.equal(two.length, csvBalls.filter((b) => b.brand === "Storm" || b.brand === "Motiv").length);

  const pearls = await listBalls(db, { cover: "pearl" });
  assert.equal(pearls.length, csvBalls.filter((b) => b.coverstock_type === "pearl").length);
  const sym = await listBalls(db, { core: "symmetric" });
  assert.ok(sym.length > 0 && sym.every((b) => b.core_type === "symmetric"));

  const recent = await listBalls(db, { after: "2026-01-01" });
  assert.equal(recent.length, csvBalls.filter((b) => b.release_date && b.release_date >= "2026-01-01").length);
  assert.ok(recent.every((b) => b.release_date >= "2026-01-01"));

  const combined = await listBalls(db, { brands: ["Hammer"], cover: "solid", core: "asymmetric", after: "2025-01-01" });
  assert.ok(combined.length > 0);
  assert.ok(combined.every((b) => b.brand === "Hammer" && b.coverstock_type === "solid" && b.core_type === "asymmetric"));
});

test("filter values are checked", () => {
  const read = (q) => readFilters(new URLSearchParams(q));
  assert.equal(read("cover=pearl&core=asymmetric&after=2025-06-01&brand=Storm&brand=Motiv").ok, true);
  assert.deepEqual(read("brand=Storm&brand=Motiv").filters.brands, ["Storm", "Motiv"]);
  assert.equal(read("cover=rubber").ok, false);
  assert.equal(read("core=round").ok, false);
  assert.equal(read("after=last week").ok, false);
});

test("a brand filter is a value, never SQL", async () => {
  const db = testDb();
  assert.deepEqual(await listBalls(db, { brands: ["Storm' OR '1'='1"] }), []);
});

test("getBall finds one ball by id", async () => {
  const db = testDb();
  const [first] = await listBalls(db);
  assert.equal((await getBall(db, first.id)).name, first.name);
  assert.equal(await getBall(db, 99999), null);
});

/* ---------- API ---------- */

const signer = await makeSigner();

async function call(path, env) {
  const headers = { "Cf-Access-Jwt-Assertion": await signer.sign(claimsFor("alex@example.com")) };
  return worker.fetch(new Request("https://bowling.alexanderk.dev" + path, { headers }), { ...settings(), ...env });
}

test("GET /api/balls lists and filters; bad filters are a 400", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };

  const all = await (await call("/api/balls", env)).json();
  assert.equal(all.balls.length, csvBalls.length);
  const ball = all.balls[0];
  for (const key of ["id", "brand", "name", "rg", "differential", "massBias", "core", "coverstock", "surface", "releaseDate", "sourceUrl"]) {
    assert.ok(key in ball, key);
  }

  const pearls = await (await call("/api/balls?cover=pearl&core=asymmetric", env)).json();
  assert.ok(pearls.balls.length > 0);
  assert.ok(pearls.balls.every((b) => b.coverstock.type === "pearl" && b.core.type === "asymmetric"));

  const bad = await call("/api/balls?cover=rubber", env);
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /cover/);
});

test("GET /api/balls/:id returns one ball, or 404", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const env = { DB: testDb() };
  const { balls } = await (await call("/api/balls", env)).json();
  const one = await (await call(`/api/balls/${balls[3].id}`, env)).json();
  assert.equal(one.ball.name, balls[3].name);
  assert.equal((await call("/api/balls/99999", env)).status, 404);
  assert.equal((await call("/api/balls/abc", env)).status, 404);
  assert.equal((await call("/api/balls/%E0%A4%A", env)).status, 404);
});

test("the ball list needs a sign-in like everything else", async (t) => {
  const certs = stubCerts([signer.jwk]);
  t.after(certs.restore);
  const res = await worker.fetch(new Request("https://bowling.alexanderk.dev/api/balls"), { ...settings(), DB: testDb() });
  assert.equal(res.status, 403);
});
