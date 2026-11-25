#!/usr/bin/env node
/**
 * PB-43 usability test results (USE-002). Owner: M2.
 *
 *   node scripts/usability.mjs
 *
 * Reads docs/testing/usability-results.csv (one row per participant and task) and,
 * if present, docs/testing/usability-sus.csv (the Google Form export). Prints the
 * unaided completion rate per task, PASS/FAIL for USE-002 (task T1, at least 80 %),
 * the median time per task, and the average SUS score.
 * An optional column done_by_plan (yes/no) holds the check against the plan's success
 * rule (e.g. the place named really is nearby and quiet). When it is filled in, a task
 * counts only if it is yes; the moderator's own record stays untouched beside it.
 * Plan and method: docs/testing/usability-test-plan.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const USE_002_TASK = 'T1';
export const USE_002_TARGET = 0.8;

/** Minimal CSV reader: quoted fields, commas and doubled quotes inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h.trim(), (r[j] ?? '').trim()])));
}

/**
 * The moderator Google Form ("StudySpot session recording") names each question
 * "column: explanation", e.g. "unaided: finished correctly within 3 minutes, on
 * their own?". Keep the part before the colon so its export reads like the CSV.
 */
export function normalizeKeys(rows) {
  return rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.split(':')[0].trim(), v])),
  );
}

const yes = (v) => /^(y|yes|true|1)$/i.test(String(v ?? '').trim());

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per task: participants, unaided (and not assisted) as recorded and by the plan's rule, rate by the rule, median time. */
export function summarizeTasks(rows) {
  const byTask = new Map();
  for (const r of rows) {
    if (!r.task) continue;
    const t = byTask.get(r.task) ?? { task: r.task, participants: 0, recorded: 0, unaided: 0, times: [] };
    t.participants += 1;
    if (yes(r.unaided) && !yes(r.assisted)) {
      t.recorded += 1;
      if (!r.done_by_plan || yes(r.done_by_plan)) t.unaided += 1;
    }
    const time = Number(r.time_s);
    if (r.time_s !== '' && Number.isFinite(time)) t.times.push(time);
    byTask.set(r.task, t);
  }
  return [...byTask.values()]
    .sort((a, b) => a.task.localeCompare(b.task))
    .map((t) => ({
      task: t.task,
      participants: t.participants,
      recorded: t.recorded,
      unaided: t.unaided,
      rate: t.participants ? t.unaided / t.participants : 0,
      medianTimeS: median(t.times),
    }));
}

/** USE-002: T1 completed unaided, by the plan's rule, by at least 80 % of participants. */
export function use002(tasks) {
  const t1 = tasks.find((t) => t.task === USE_002_TASK);
  if (!t1 || t1.participants === 0) return { verdict: 'NO DATA', rate: null };
  return { verdict: t1.rate >= USE_002_TARGET ? 'PASS' : 'FAIL', rate: t1.rate };
}

/**
 * System Usability Scale for one person: answers 1..5 to the 10 statements in order.
 * Odd items score (answer - 1), even items (5 - answer); the sum times 2.5 gives 0..100.
 */
export function susScore(answers) {
  if (answers.length !== 10 || answers.some((a) => !(a >= 1 && a <= 5))) return null;
  const sum = answers.reduce((acc, a, i) => acc + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

/** The Google Form export: the 10 SUS columns are the ones whose answers are all 1..5, in form order. */
export function susScores(rows) {
  if (!rows.length) return [];
  const columns = Object.keys(rows[0]).filter((k) =>
    rows.every((r) => /^[1-5]$/.test(String(r[k]).trim())) && !/participant/i.test(k),
  );
  if (columns.length < 10) return [];
  const sus = columns.slice(0, 10);
  return rows.map((r) => susScore(sus.map((k) => Number(r[k])))).filter((s) => s !== null);
}

function main() {
  const resultsFile = join(ROOT, 'docs/testing/usability-results.csv');
  const susFile = join(ROOT, 'docs/testing/usability-sus.csv');
  const tasks = summarizeTasks(normalizeKeys(parseCsv(readFileSync(resultsFile, 'utf8'))));
  if (!tasks.length) {
    console.log('No results yet: fill in docs/testing/usability-results.csv (see the test plan).');
    return;
  }
  const pct = (x) => `${Math.round(x * 100)} %`;
  console.log('Task  Participants  Recorded  By plan  Rate   Median time');
  for (const t of tasks) {
    console.log(
      `${t.task.padEnd(6)}${String(t.participants).padEnd(14)}${String(t.recorded).padEnd(10)}${String(t.unaided).padEnd(9)}${pct(t.rate).padEnd(7)}${t.medianTimeS === null ? '-' : `${t.medianTimeS} s`}`,
    );
  }
  const verdict = use002(tasks);
  console.log(
    `\nUSE-002 (T1 unaided >= ${pct(USE_002_TARGET)}): ${verdict.verdict}${verdict.rate === null ? '' : ` (${pct(verdict.rate)})`}`,
  );
  if (existsSync(susFile)) {
    const scores = susScores(parseCsv(readFileSync(susFile, 'utf8')));
    if (scores.length) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      console.log(`SUS: ${avg.toFixed(1)} average over ${scores.length} participants (68 = average usability)`);
    } else console.log('SUS: could not find 10 answer columns with values 1-5 in usability-sus.csv');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
