#!/usr/bin/env node
/**
 * Builds the requirements traceability matrix from docs/testing/test-cases.csv (PB-45).
 *
 *   npm run test:matrix            writes docs/testing/traceability-matrix.md
 *   npm run test:matrix -- --check also fails (exit 1) on sheet problems; CI runs this
 *
 * Problems it reports:
 *   - a TC-ID used twice, or not in the form TC-M<1-6>-<number>
 *   - an "Automated test" file that does not exist, or that never mentions the TC-ID
 *     (name tests in code with the ID: it('TC-M3-04 ...'))
 *   - a test case with no requirement
 *
 * Requirement cells may hold several IDs ("FR-022, SEC-004"), ranges with the same
 * prefix ("FR-022..FR-024") and notes in brackets ("SEC-013 (rate limit)").
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = join(ROOT, 'docs/testing/test-cases.csv');
const OUT = join(ROOT, 'docs/testing/traceability-matrix.md');
const CHECK = process.argv.includes('--check');

/** RFC 4180 CSV parser (quoted fields, doubled quotes, commas and newlines in quotes). */
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
  return rows;
}

const REQ_ID = /^([A-Z]+(?:-[A-Z]+)*)-(\d+)([a-z]?)$/;

/** "FR-022..FR-024, SEC-004 (own data)" -> { ids: [FR-022, FR-023, FR-024, SEC-004], other: [] } */
export function requirementsOf(cell) {
  const ids = [];
  const other = [];
  const cleaned = cell.replace(/\([^)]*\)/g, '');
  for (const raw of cleaned.split(/[,;]/)) {
    const part = raw.trim();
    if (!part || part === '-') continue;
    const range = part.match(/^(\S+)\s*\.\.\s*(\S+)$/);
    if (range) {
      const a = range[1].match(REQ_ID);
      const b = range[2].match(REQ_ID);
      if (a && b && a[1] === b[1] && Number(a[2]) <= Number(b[2])) {
        const width = a[2].length;
        for (let n = Number(a[2]); n <= Number(b[2]); n++) {
          ids.push(`${a[1]}-${String(n).padStart(width, '0')}`);
        }
        continue;
      }
    }
    if (REQ_ID.test(part)) ids.push(part);
    else other.push(part);
  }
  return { ids, other };
}

const compareIds = (x, y) => {
  const a = x.match(REQ_ID);
  const b = y.match(REQ_ID);
  if (!a || !b) return x.localeCompare(y);
  return a[1].localeCompare(b[1]) || Number(a[2]) - Number(b[2]) || a[3].localeCompare(b[3]);
};

const outcome = (result) => {
  const r = (result ?? '').trim().toLowerCase();
  if (r === 'pass') return 'pass';
  if (r === 'fail') return 'fail';
  return 'not run';
};

function main() {
  const [header, ...data] = parseCsv(readFileSync(SHEET, 'utf8'));
  const col = (name) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error(`test-cases.csv has no "${name}" column`);
    return i;
  };
  const C = {
    id: col('TC-ID'),
    req: col('Requirement'),
    technique: col('Technique'),
    level: col('Level'),
    result: col('Result'),
    tester: col('Tester'),
    auto: col('Automated test'),
  };

  const problems = [];
  const seen = new Set();
  const cases = data.map((r, i) => {
    const tc = {
      line: i + 2,
      id: (r[C.id] ?? '').trim(),
      req: (r[C.req] ?? '').trim(),
      technique: (r[C.technique] ?? '').trim(),
      level: (r[C.level] ?? '').trim() || 'Unspecified',
      outcome: outcome(r[C.result]),
      tester: (r[C.tester] ?? '').trim() || '?',
      auto: (r[C.auto] ?? '').trim(),
    };
    if (!/^TC-M[1-6]-\d{2,}$/.test(tc.id)) {
      problems.push(`line ${tc.line}: "${tc.id}" is not a TC-ID like TC-M3-04`);
    }
    if (seen.has(tc.id)) problems.push(`line ${tc.line}: ${tc.id} is used more than once`);
    seen.add(tc.id);
    const { ids, other } = requirementsOf(tc.req);
    tc.reqIds = ids;
    tc.otherRefs = other;
    if (!ids.length && !other.length) problems.push(`${tc.id}: no requirement given`);
    if (tc.auto && tc.auto !== '-') {
      const file = join(ROOT, tc.auto);
      if (!existsSync(file)) problems.push(`${tc.id}: automated test file ${tc.auto} does not exist`);
      else if (!readFileSync(file, 'utf8').includes(tc.id)) {
        problems.push(`${tc.id}: ${tc.auto} never mentions ${tc.id} (put the ID in the test name)`);
      }
    }
    return tc;
  });

  // Requirement -> test cases
  const byReq = new Map();
  const add = (key, tc) => byReq.set(key, [...(byReq.get(key) ?? []), tc]);
  for (const tc of cases) {
    for (const id of new Set(tc.reqIds)) add(id, tc);
    for (const ref of tc.otherRefs) add(ref, tc);
  }
  const reqKeys = [...byReq.keys()].sort((a, b) => {
    const ra = REQ_ID.test(a);
    const rb = REQ_ID.test(b);
    return ra === rb ? compareIds(a, b) : ra ? -1 : 1;
  });

  const status = (list) => {
    const fail = list.filter((t) => t.outcome === 'fail').length;
    const notRun = list.filter((t) => t.outcome === 'not run').length;
    if (fail) return `❌ ${fail} failing`;
    if (notRun) return `⏳ ${notRun} not run`;
    return '✅ all pass';
  };
  const count = (list, o) => list.filter((t) => t.outcome === o).length;
  const groupBy = (key) => {
    const m = new Map();
    for (const tc of cases) m.set(tc[key], [...(m.get(tc[key]) ?? []), tc]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  };
  const esc = (s) => s.replace(/\|/g, '\\|');

  const lines = [
    '# Requirements traceability matrix',
    '',
    '> Generated from [`test-cases.csv`](test-cases.csv) by `npm run test:matrix`. Do not edit by hand: edit the sheet and run the command again.',
    '',
    '## Summary',
    '',
    `**${cases.length}** test cases: **${count(cases, 'pass')}** pass, **${count(cases, 'fail')}** fail, **${count(cases, 'not run')}** not run yet. They cover **${reqKeys.filter((k) => REQ_ID.test(k)).length}** requirement IDs.`,
    '',
    '| Member | Test cases | Pass | Fail | Not run | Automated |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...groupBy('tester').map(
      ([who, list]) =>
        `| ${who} | ${list.length} | ${count(list, 'pass')} | ${count(list, 'fail')} | ${count(list, 'not run')} | ${list.filter((t) => t.auto && t.auto !== '-').length} |`,
    ),
    '',
    '| Level | Test cases |',
    '| --- | ---: |',
    ...groupBy('level').map(([level, list]) => `| ${level} | ${list.length} |`),
    '',
    '## Requirement → test cases',
    '',
    '| Requirement | Test cases | Levels | Status |',
    '| --- | --- | --- | --- |',
    ...reqKeys.map((k) => {
      const list = byReq.get(k);
      const levels = [...new Set(list.map((t) => t.level))].join(', ');
      return `| ${esc(k)} | ${list.map((t) => t.id).join(', ')} | ${esc(levels)} | ${status(list)} |`;
    }),
    '',
    '## Test case → requirement',
    '',
    '| Test case | Requirement | Technique | Level | Result | Automated test |',
    '| --- | --- | --- | --- | --- | --- |',
    ...cases.map(
      (t) =>
        `| ${t.id} | ${esc(t.req)} | ${esc(t.technique)} | ${esc(t.level)} | ${t.outcome} | ${t.auto && t.auto !== '-' ? `\`${t.auto}\`` : 'manual'} |`,
    ),
    '',
    '## Sheet problems',
    '',
    ...(problems.length ? problems.map((p) => `- ${p}`) : ['None.']),
    '',
  ];
  writeFileSync(OUT, lines.join('\n'));
  console.log(
    `Wrote docs/testing/traceability-matrix.md: ${cases.length} test cases, ${reqKeys.length} requirements/references, ${problems.length} problem(s).`,
  );
  for (const p of problems) console.log(`  - ${p}`);
  if (CHECK && problems.length) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
