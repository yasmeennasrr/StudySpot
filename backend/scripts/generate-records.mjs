/**
 * Writes backend/seed/records.json: 90 days of synthetic survey and audio inputs
 * for every seeded venue, so the details screen shows every label in the demo
 * (PB-11, RT-001..RT-019). Owner: M4.
 *
 *   npm --prefix backend run seed:records     (then: npm --prefix backend run seed)
 *
 * Run it again when backend/seed/venues.json changes. Levels and patterns are
 * the same on every run for the same venues (fixed random seed); only the times
 * move with the anchor.
 *
 * The file holds an `anchor` time. `npm run seed` moves the newest inputs to
 * "now" and the history by whole weeks, so weekday and hour patterns stay right
 * and the labels look the same whenever the seed is loaded.
 *
 * Venues take turns through four scenarios (index in venues.json, mod 4):
 *   0 current     inputs in the last hour (crowd, noise) and 6 hours (Wi-Fi)
 *   1 hours_ago   newest inputs 3 hours ago (Wi-Fi 9 hours ago)
 *   2 historical  history only, newest input 2 days ago
 *   3 sparse      a few noise inputs only: crowd and Wi-Fi "Unavailable"
 * A venue without Wi-Fi (wifiAvailable: false) never gets Wi-Fi answers.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed');
const DAYS = 89;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

function readVenues() {
  for (const name of ['venues.json', 'venues.sample.json']) {
    const file = join(SEED_DIR, name);
    if (existsSync(file)) return { name, venues: JSON.parse(readFileSync(file, 'utf8')) };
  }
  throw new Error(`No venues.json or venues.sample.json in ${SEED_DIR}`);
}

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampLevel = (x) => Math.min(3, Math.max(1, Math.round(x)));

const CAIRO = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cairoParts(date) {
  const p = Object.fromEntries(CAIRO.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, weekday: WEEKDAYS.indexOf(p.weekday), hour: +p.hour };
}

/** The UTC instant of a Cairo wall-clock time (Cairo is UTC+2, or UTC+3 in summer time). */
function cairoTime(y, m, d, hour, minute) {
  for (const offset of [2, 3]) {
    const t = new Date(Date.UTC(y, m - 1, d, hour - offset, minute));
    const p = cairoParts(t);
    if (p.hour === hour && p.d === d) return t;
  }
  return new Date(Date.UTC(y, m - 1, d, hour - 2, minute));
}

/** Hours the venue is open on a weekday; venues with unknown hours count as 09:00-23:00. */
function openHours(venue, weekday) {
  const slots = venue.openingHours ? venue.openingHours[weekday] : [{ open: '09:00', close: '23:00' }];
  if (!slots) return [];
  const hours = [];
  for (const { open, close } of slots) {
    const start = Number(open.slice(0, 2));
    let end = Number(close.slice(0, 2));
    if (end <= start) end = 24; // closes at or after midnight: stop the day at midnight
    for (let h = start; h < end; h++) hours.push(h);
  }
  return hours;
}

/** Typical crowd for an hour: busier in the afternoon and evening, and at weekends. */
function crowdAround(hour, weekday, busy) {
  const weekend = weekday === 5 || weekday === 6;
  let base = hour < 12 ? 1.2 : hour < 17 ? 2.2 : hour < 20 ? 1.8 : 2.4;
  if (weekend) base += 0.4;
  return base + busy;
}

function generate(venues) {
  const anchor = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const records = [];
  venues.forEach((venue, index) => {
    const rand = rng(1000 + index);
    const scenario = ['current', 'hours_ago', 'historical', 'sparse'][index % 4];
    const hasWifi = venue.wifiAvailable !== false;
    // Per venue character: how busy, how loud for its crowd, how good the Wi-Fi.
    const busy = rand() * 0.8 - 0.4;
    const loud = venue.studyType === 'individual' ? -0.6 : venue.studyType === 'group' ? 0.4 : 0;
    const wifi = 1.5 + rand() * 1.5;
    const add = (conditionType, value, sourceType, at) =>
      records.push({
        venueId: venue.id,
        conditionType,
        value: clampLevel(value),
        sourceType,
        recordedAt: at.toISOString(),
      });
    const survey = (at, crowd) => {
      const sourceType = rand() < 0.5 ? 'qr_survey' : 'in_app_survey';
      if (scenario !== 'sparse') add('crowd', crowd + (rand() - 0.5), sourceType, at);
      if (scenario !== 'sparse' || rand() < 0.5) add('noise', crowd + loud + (rand() - 0.5), sourceType, at);
      // About a third of people answer "did not use it" for Wi-Fi, which stores nothing.
      if (hasWifi && scenario !== 'sparse' && rand() < 0.65) add('wifi', wifi + (rand() - 0.5), sourceType, at);
    };

    // History: from 89 days ago up to 2 days ago (so it never looks current).
    const rate = scenario === 'sparse' ? 0.006 : 0.08;
    for (let daysAgo = DAYS; daysAgo >= 2; daysAgo--) {
      const day = cairoParts(new Date(anchor.getTime() - daysAgo * DAY_MS));
      for (const hour of openHours(venue, day.weekday)) {
        if (rand() >= rate) continue;
        const at = cairoTime(day.y, day.m, day.d, hour, Math.floor(rand() * 60));
        const crowd = crowdAround(hour, day.weekday, busy);
        survey(at, crowd);
        if (rand() < 0.3) add('noise', crowd + loud + (rand() - 0.5), 'audio_analysis', at);
      }
    }

    // Recent inputs that make the venue's scenario show.
    const now = cairoParts(anchor);
    const crowdNow = crowdAround(now.hour, now.weekday, busy);
    const ago = (minutes) => new Date(anchor.getTime() - minutes * 60_000);
    if (scenario === 'current') {
      for (const m of [5, 18, 34]) survey(ago(m), crowdNow);
      add('noise', crowdNow + loud, 'audio_analysis', ago(12));
      if (hasWifi) add('wifi', wifi, 'in_app_survey', ago(150));
    } else if (scenario === 'hours_ago') {
      // Crowd and noise answers only, so Wi-Fi shows its own, older "hours ago" value.
      for (const m of [180, 195]) {
        add('crowd', crowdNow + (rand() - 0.5), 'in_app_survey', ago(m));
        add('noise', crowdNow + loud + (rand() - 0.5), 'in_app_survey', ago(m));
      }
      if (hasWifi) add('wifi', wifi, 'qr_survey', ago(9 * 60));
    }
  });
  records.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.venueId.localeCompare(b.venueId));
  return { anchor: anchor.toISOString(), records };
}

const { name, venues } = readVenues();
const out = generate(venues);
// One record per line keeps the file readable and the git diff small.
const body = out.records.map((r) => '    ' + JSON.stringify(r)).join(',\n');
writeFileSync(
  join(SEED_DIR, 'records.json'),
  `{\n  "anchor": "${out.anchor}",\n  "records": [\n${body}\n  ]\n}\n`,
);
console.log(`Wrote seed/records.json: ${out.records.length} records for ${venues.length} venues from ${name}.`);
