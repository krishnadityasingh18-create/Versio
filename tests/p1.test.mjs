// @ts-check
// Phase 2 (P1): mapper additions, explore cursor + query text, invalid-input paths. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { toProject, toRequestSummary, toVersion, withStarred } from "../lib/actions/common.js";
import { cleanQuery, decodeCursor, encodeCursor } from "../lib/actions/explore.js";
import { getExplore } from "../app/actions/explore.js";
import { getProfile } from "../app/actions/profiles.js";
import { toggleStar } from "../app/actions/projects.js";

const UUID = "6f1c2a3e-8b4d-4c6e-9f1a-2b3c4d5e6f70";
const TS = "2026-10-13T09:15:02.123456+00:00";

test("toVersion carries number; toProject carries star_count; toRequestSummary carries project_type", () => {
  assert.equal(toVersion({ id: "7", number: "3", project_id: UUID }).number, 3);
  assert.equal(toProject({ id: UUID, star_count: 5 }).star_count, 5);
  assert.equal(toProject({ id: UUID }).star_count, 0);
  assert.equal(toProject({ id: UUID }).starred, undefined);
  assert.equal(toRequestSummary({ id: 1, project: { title: "T", type: "cad" } }).project_type, "cad");
});

test("withStarred: signed out returns the list unchanged without querying", async () => {
  const projects = [toProject({ id: UUID })];
  /** @type {any} */ const noClient = null;
  assert.equal(await withStarred(noClient, null, projects), projects);
  assert.deepEqual(await withStarred(noClient, UUID, []), []);
});

test("withStarred: one query for the whole list sets starred", async () => {
  const other = "11111111-1111-1111-1111-111111111111";
  /** @type {string[]} */ const calls = [];
  const fake = /** @type {any} */ ({
    from: (/** @type {string} */ t) => {
      calls.push(t);
      const q = { select: () => q, eq: () => q, in: () => Promise.resolve({ data: [{ project_id: UUID }], error: null }) };
      return q;
    },
  });
  const out = await withStarred(fake, UUID, [toProject({ id: UUID }), toProject({ id: other })]);
  assert.deepEqual(out.map((p) => p.starred), [true, false]);
  assert.deepEqual(calls, ["stars"]);
});

test("explore cursor round-trips per sort and rejects junk", () => {
  const row = { id: UUID, updated_at: TS, star_count: 4 };
  assert.deepEqual(decodeCursor(encodeCursor("recent", row), "recent"), { v: TS, id: UUID });
  assert.deepEqual(decodeCursor(encodeCursor("stars", row), "stars"), { v: 4, id: UUID });
  assert.equal(decodeCursor(encodeCursor("recent", row), "stars"), null, "cursor from the other sort");
  assert.equal(decodeCursor("not base64 json", "recent"), null);
  assert.equal(decodeCursor("", "recent"), null);
  const forge = (/** @type {any} */ c) => Buffer.from(JSON.stringify(c)).toString("base64url");
  assert.equal(decodeCursor(forge({ s: "recent", v: "x),id.gt.(", id: UUID }), "recent"), null, "filter injection");
  assert.equal(decodeCursor(forge({ s: "stars", v: -1, id: UUID }), "stars"), null);
  assert.equal(decodeCursor(forge({ s: "stars", v: 1, id: "1,or" }), "stars"), null);
});

test("cleanQuery strips LIKE wildcards and PostgREST delimiters", () => {
  assert.equal(cleanQuery("  Héllo,  wörld*(%_)  "), "Héllo wörld");
  assert.equal(cleanQuery("rock'n-roll 2"), "rock'n-roll 2");
  assert.equal(cleanQuery(undefined), "");
  assert.equal(cleanQuery("***"), "");
});

/** @param {Promise<any>} p */
async function assertInvalid(p) {
  const r = await p;
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_INPUT");
}

test("new actions reject bad input before touching Supabase", async () => {
  /** @type {any} */ const explore = getExplore;
  await assertInvalid(explore({ type: "video" }));
  await assertInvalid(explore({ sort: "popular" }));
  await assertInvalid(explore({ q: "x".repeat(201) }));
  await assertInvalid(explore({ cursor: 5 }));
  await assertInvalid(explore("q"));
  await assertInvalid(getProfile("ab"));
  await assertInvalid(getProfile("no spaces"));
  await assertInvalid(/** @type {any} */ (getProfile)(null));
  await assertInvalid(toggleStar("not-a-uuid"));
  await assertInvalid(/** @type {any} */ (toggleStar)(undefined));
});

test("valid input outside a Next runtime returns a Result instead of throwing", async () => {
  for (const r of [await getExplore(), await getProfile("ann"), await toggleStar(UUID)]) {
    assert.equal(r.ok, false);
    assert.equal(/** @type {any} */ (r).code, "INTERNAL");
  }
});
