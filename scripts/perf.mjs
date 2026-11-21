#!/usr/bin/env node
/**
 * Performance measurements (PB-41, PERF-001..PERF-010). Owner: M1.
 * No dependencies: Node 20+ fetch and timers only.
 *
 *   npm run perf                                   local backend, 100 users for 30 s
 *   npm run perf -- --base https://studyspot-api-x8u6.onrender.com/api/v1
 *   npm run perf -- --users 50 --seconds 20 --out docs/testing/performance-results.md \
 *     --env "Render free tier + Supabase, from a laptop in Cairo"
 *
 * Test cases: TC-M1-90 (PERF-001), TC-M1-91 (PERF-002), TC-M1-92 (PERF-006).
 *
 * What it measures:
 *   PERF-001  search (area, name, nearby with a filter): 95% of answers within 2 s
 *   PERF-002  venue details: 95% within 2 s
 *   PERF-006  --users virtual users at once, each searching nearby then opening a
 *             venue, for --seconds: PERF-001 and PERF-002 still hold, under 1% errors
 *   PERF-003, -005, -009, -010 belong to stories not merged yet; the report says so
 *             until their endpoints exist.
 *
 * Note on the rate limit: the API allows THROTTLE_LIMIT requests per minute per client
 * address (120 by default). Real users each have their own address; one test machine
 * does not, so 429 answers are counted apart and the report flags them. For a fair
 * PERF-006 run, raise THROTTLE_LIMIT on the server for the duration of the test.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => {
    if (a.startsWith("--"))
      pairs.push([
        a.slice(2),
        all[i + 1]?.startsWith("--") ? "true" : all[i + 1],
      ]);
    return pairs;
  }, []),
);
const BASE = (args.base ?? "http://localhost:3000/api/v1").replace(/\/$/, "");
const USERS = Number(args.users ?? 100);
const SECONDS = Number(args.seconds ?? 30);
const SAMPLES = Number(args.samples ?? 40);
const OUT = args.out ?? null;
const ENV = args.env ?? null;
const LIMIT_MS = 2000;

/** One timed request. */
async function timed(path) {
  const start = performance.now();
  try {
    const res = await fetch(BASE + path, {
      headers: { Accept: "application/json" },
    });
    await res.arrayBuffer();
    return { ms: performance.now() - start, status: res.status };
  } catch (err) {
    return {
      ms: performance.now() - start,
      status: 0,
      error: String(err?.cause?.code ?? err),
    };
  }
}

function summarize(results) {
  const ok = results
    .filter((r) => r.status >= 200 && r.status < 300)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const pct = (p) =>
    ok.length
      ? ok[Math.min(ok.length - 1, Math.ceil((p / 100) * ok.length) - 1)]
      : NaN;
  const limited = results.filter((r) => r.status === 429).length;
  const errors = results.filter(
    (r) => !(r.status >= 200 && r.status < 300) && r.status !== 429,
  ).length;
  return {
    count: results.length,
    ok: ok.length,
    limited,
    errors,
    p50: pct(50),
    p95: pct(95),
    max: ok.length ? ok[ok.length - 1] : NaN,
  };
}

const fmt = (ms) => (Number.isFinite(ms) ? `${Math.round(ms)} ms` : "-");
const verdict = (s, limit = LIMIT_MS) =>
  !s.ok
    ? "Not measured"
    : s.limited > 0
      ? "Not valid (429)"
      : s.p95 <= limit && s.errors / s.count < 0.01
        ? "Pass"
        : "Fail";

async function sequential(paths) {
  const out = [];
  for (let i = 0; i < SAMPLES; i++)
    out.push(await timed(paths[i % paths.length]));
  return out;
}

async function main() {
  console.log(`StudySpot performance run against ${BASE}`);
  const health = await timed("/health");
  if (health.status !== 200) {
    console.error(
      `The API is not answering at ${BASE}/health (status ${health.status}). Start it first.`,
    );
    process.exit(1);
  }
  console.log(
    `  health answered in ${fmt(health.ms)} (the first request after sleep includes a cold start)`,
  );

  const browse = await fetch(`${BASE}/venues?limit=30`).then((r) => r.json());
  const venues = (browse.items ?? []).filter((v) => v.location);
  if (!venues.length) throw new Error("No venues: run npm run seed first.");
  const ids = venues.map((v) => v.id);
  const spots = venues.map((v) => v.location);

  // Warm-up, not measured: caches and connection pools as in normal use.
  for (const id of ids.slice(0, 5)) await timed(`/venues/${id}`);

  const searchPaths = [
    "/venues/search?area=zamalek",
    "/venues/search?q=qahwa",
    ...spots
      .slice(0, 5)
      .map((p) => `/venues/nearby?lat=${p.lat}&lng=${p.lng}&noise=quiet`),
  ];
  console.log(`  PERF-001 search, ${SAMPLES} requests one at a time...`);
  const search = summarize(await sequential(searchPaths));
  console.log(`  PERF-002 details, ${SAMPLES} requests one at a time...`);
  const details = summarize(await sequential(ids.map((id) => `/venues/${id}`)));

  console.log(`  PERF-006 ${USERS} users at once for ${SECONDS} s...`);
  const load = { search: [], details: [] };
  const stopAt = performance.now() + SECONDS * 1000;
  const user = async (n) => {
    let i = n;
    while (performance.now() < stopAt) {
      const p = spots[i % spots.length];
      load.search.push(await timed(`/venues/nearby?lat=${p.lat}&lng=${p.lng}`));
      load.details.push(await timed(`/venues/${ids[(i * 7) % ids.length]}`));
      i++;
    }
  };
  const loadStart = performance.now();
  await Promise.all(Array.from({ length: USERS }, (_, n) => user(n)));
  const loadSeconds = (performance.now() - loadStart) / 1000;
  const loadSearch = summarize(load.search);
  const loadDetails = summarize(load.details);
  const throughput = (load.search.length + load.details.length) / loadSeconds;
  const loadVerdict =
    loadSearch.limited + loadDetails.limited > 0
      ? "Not valid: rate-limited (raise THROTTLE_LIMIT for the run)"
      : verdict(loadSearch) === "Pass" && verdict(loadDetails) === "Pass"
        ? "Pass"
        : "Fail";

  const row = (name, req, s, v) =>
    `| ${req} | ${name} | ${s.count} | ${fmt(s.p50)} | ${fmt(s.p95)} | ${fmt(s.max)} | ${s.errors} | ${s.limited} | ${v} |`;
  const report = [
    "# Performance results (PB-41)",
    "",
    `> Generated by \`npm run perf\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC against \`${BASE}\`.`,
    "> Do not edit by hand: run the command again (add --env to describe where it ran).",
    "",
    ...(ENV ? [`Environment: ${ENV}.`, ""] : []),
    `Target for PERF-001 and PERF-002: 95% of answers within ${LIMIT_MS} ms (p95). Errors count as failures; 429 (rate limit) is listed apart.`,
    "",
    "| Requirement | Measurement | Requests | p50 | p95 | Max | Errors | 429 | Result |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    row(
      "TC-M1-90 search (area, name, nearby + filter), one user",
      "PERF-001",
      search,
      verdict(search),
    ),
    row(
      "TC-M1-91 venue details, one user",
      "PERF-002",
      details,
      verdict(details),
    ),
    row(
      `TC-M1-92 nearby search, ${USERS} users at once`,
      "PERF-006",
      loadSearch,
      verdict(loadSearch),
    ),
    row(
      `TC-M1-92 venue details, ${USERS} users at once`,
      "PERF-006",
      loadDetails,
      verdict(loadDetails),
    ),
    "",
    `**PERF-006 (${USERS} concurrent users, ${SECONDS} s): ${loadVerdict}.** Throughput ${throughput.toFixed(0)} requests per second.`,
    "",
    "| Requirement | Target | Status |",
    "| --- | --- | --- |",
    "| PERF-003 | StudyMatch answer within 10 s, also when the AI is down | Measured when PB-29 and PB-46 are merged |",
    "| PERF-005 | A new survey shows in the venue values within 10 s | Measured when PB-17 is merged (the noise-sample path already updates at once: TC-M1-82) |",
    "| PERF-007 | Progress shown while StudyMatch works | Checked in the app by demonstration with PB-29 |",
    "| PERF-009 | Receipt-code link within 2 s | Measured when PB-21 is merged |",
    "| PERF-010 | Coupon e-mail within 60 s | Measured when PB-26 is merged |",
    "",
  ];
  if (OUT) {
    writeFileSync(join(ROOT, OUT), report.join("\n"));
    console.log(`Wrote ${OUT}`);
  } else {
    console.log("\n" + report.join("\n"));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
