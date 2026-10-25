#!/usr/bin/env node
/**
 * Draws the module dependency graph FROM THE CODE, to sit next to SDS Figure 2:
 *   solid arrow  = module A imports module B's *.module.ts (A uses B's interface)
 *   dashed arrow = module A emits a DomainEvent that module B listens to
 *
 *   npm run deps:graph   -> docs/architecture/generated/module-graph.{dot,svg,png}
 *
 * Needs Graphviz `dot` on the PATH for the SVG/PNG (the .dot file is always written).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '../docs/architecture/generated');

const raw = execFileSync(
  'npx',
  ['depcruise', 'src', '--config', '.dependency-cruiser.cjs', '--output-type', 'json'],
  {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  },
);
const cruise = JSON.parse(raw.toString());

const unitOf = (path) => {
  const m = path.match(/^src\/(modules|adapters)\/([^/]+)\//);
  return m ? `${m[1] === 'adapters' ? 'adapter:' : ''}${m[2]}` : null;
};

const nodes = new Set();
const uses = new Set();
for (const mod of cruise.modules) {
  const from = unitOf(mod.source);
  if (!from) continue;
  if (from !== 'clock') nodes.add(from);
  for (const dep of mod.dependencies) {
    const to = unitOf(dep.resolved);
    // Clock is used almost everywhere; it is noted in the key instead of drawn 8 times.
    if (to && to !== from && to !== 'clock' && /\.module\.ts$/.test(dep.resolved))
      uses.add(`${from}|${to}`);
  }
}

// Domain events: who emits, who listens.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) files.push(p);
  }
};
walk(join(root, 'src/modules'));
const emitters = {};
const listeners = {};
for (const file of files) {
  const unit = unitOf(relative(root, file).replace(/\\/g, '/'));
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/emit\(\s*DomainEvent\.(\w+)/g))
    (emitters[m[1]] ??= new Set()).add(unit);
  for (const m of text.matchAll(/@OnEvent\(\s*DomainEvent\.(\w+)/g))
    (listeners[m[1]] ??= new Set()).add(unit);
}
const events = [];
for (const [event, from] of Object.entries(emitters)) {
  for (const a of from)
    for (const b of listeners[event] ?? []) if (a !== b) events.push([a, b, event]);
}

// Designed events (catalogue at the top of src/common/events/domain-events.ts) not yet emitted in code.
const UNIT_BY_NAME = {
  surveys: 'surveys',
  'audio analysis': 'audio',
  accounts: 'accounts',
  'audit log': 'audit',
  administration: 'admin',
  presence: 'presence',
  notifications: 'notifications',
  configuration: 'configuration',
  conditions: 'conditions',
  rewards: 'rewards',
};
const catalogue = readFileSync(join(root, 'src/common/events/domain-events.ts'), 'utf8');
const planned = [];
for (const m of catalogue.matchAll(/^\s*\*\s+(\w+)\s{2,}(.+?)\s+->\s+(.+?)(?:\s+\(.*)?$/gm)) {
  const [, event, fromName, toNames] = m;
  const a = UNIT_BY_NAME[fromName.trim().toLowerCase()];
  for (const toName of toNames.split(',')) {
    const b = UNIT_BY_NAME[toName.trim().toLowerCase()];
    if (a && b && !events.some(([x, y, e]) => x === a && y === b && e === event))
      planned.push([a, b, event]);
  }
}

const label = (n) =>
  n.startsWith('adapter:')
    ? `«adapter»\\n${n.slice(8)}`
    : n.replace(/(^|-)(\w)/g, (_m, s, c) => (s ? ' ' : '') + c.toUpperCase());
const id = (n) => `"${n}"`;
const lines = [
  'digraph StudySpotModules {',
  '  graph [rankdir=LR, fontname="Helvetica", fontsize=14, labelloc=t, label="StudySpot backend: module dependencies generated from the code", nodesep=0.35, ranksep=0.9];',
  '  node [shape=box, style="rounded", fontname="Helvetica", fontsize=13, color="#555555"];',
  '  edge [color="#666666", arrowsize=0.7, fontname="Helvetica", fontsize=9];',
];
for (const n of [...nodes].sort()) {
  const extra = n.startsWith('adapter:')
    ? ', style="rounded,dashed"'
    : ['presence', 'configuration'].includes(n)
      ? ', color="#1f6feb", penwidth=1.6'
      : '';
  lines.push(`  ${id(n)} [label="${label(n)}"${extra}];`);
}
for (const e of [...uses].sort()) {
  const [a, b] = e.split('|');
  lines.push(`  ${id(a)} -> ${id(b)};`);
}
for (const [a, b, ev] of events)
  lines.push(
    `  ${id(a)} -> ${id(b)} [style=dashed, color="#1f6feb", fontcolor="#1f6feb", label="${ev}"];`,
  );
for (const [a, b, ev] of planned)
  lines.push(
    `  ${id(a)} -> ${id(b)} [style=dotted, color="#999999", fontcolor="#999999", label="${ev} (planned)"];`,
  );
lines.push(
  '  subgraph cluster_key { label="Key"; fontsize=10; color="#cccccc";',
  '    k1 [shape=plaintext, label="solid: uses interface\\ldashed blue: event emitted in code\\ldotted grey: event designed, emitted in a later sprint\\lblue box: new in SDS v0.3\\lClock (also new) is used by most modules; not drawn\\l"]; }',
);
lines.push('}');

// ---- Dependency matrix (SDS 5): caller x provider, via which interface, sync or event.
const contractFiles = readdirSync(join(root, 'src/contracts')).map((f) =>
  join(root, 'src/contracts', f),
);
const interfaceByToken = {};
for (const f of contractFiles) {
  for (const m of readFileSync(f, 'utf8').matchAll(/export const (\w+) = Symbol\('(\w+)'\)/g))
    interfaceByToken[m[1]] = m[2];
}
const allSrc = [];
const walkAll = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkAll(p);
    else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) allSrc.push(p);
  }
};
walkAll(join(root, 'src/modules'));
walkAll(join(root, 'src/adapters'));
const providerByToken = {};
const injectsByUnit = {};
for (const file of allSrc) {
  const unit = unitOf(relative(root, file).replace(/\\/g, '/'));
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/provide:\s*(\w+)/g))
    if (interfaceByToken[m[1]]) providerByToken[m[1]] = unit;
  for (const m of text.matchAll(/@Inject\((\w+)\)/g))
    if (interfaceByToken[m[1]]) (injectsByUnit[unit] ??= new Set()).add(m[1]);
  // Routes guarded by the shared AuthGuard depend on IAuth through it.
  if (/@UseGuards\(AuthGuard\)/.test(text)) (injectsByUnit[unit] ??= new Set()).add('AUTH');
}
const cells = {};
const put = (a, b, text) => ((cells[a] ??= {})[b] ??= []).push(text);
for (const [unit, tokens] of Object.entries(injectsByUnit)) {
  for (const t of tokens) {
    const provider = providerByToken[t];
    if (provider && provider !== unit) put(unit, provider, interfaceByToken[t]);
  }
}
for (const [a, b, ev] of events) put(a, b, `event ${ev}`);
for (const [a, b, ev] of planned) put(a, b, `event ${ev} (planned)`);
const callers = Object.keys(cells).sort();
const providers = [...new Set(Object.values(cells).flatMap((r) => Object.keys(r)))].sort();
const name = (u) => (u.startsWith('adapter:') ? `${u.slice(8)} adapter` : u);
const matrix = [
  '# Module dependency matrix (generated)',
  '',
  'Generated from the code by `npm run deps:graph` (backend/scripts/module-graph.mjs). Do not edit by hand.',
  'Rows are callers, columns are providers. A cell names the interface the caller injects, or the domain event it publishes to that listener.',
  '"(planned)" marks an event designed in the SDS that the module will emit once its stub is replaced. Every module also uses IClock and its own repositories (not shown).',
  '',
  `| caller \\ provider | ${providers.map(name).join(' | ')} |`,
  `| --- | ${providers.map(() => '---').join(' | ')} |`,
  ...callers.map(
    (c) =>
      `| **${name(c)}** | ${providers.map((p) => (cells[c][p] ?? []).join('<br>')).join(' | ')} |`,
  ),
  '',
];
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'dependency-matrix.md'), matrix.join('\n'));
console.log(
  `Dependency matrix: ${callers.length} callers x ${providers.length} providers -> dependency-matrix.md`,
);

const dotFile = join(outDir, 'module-graph.dot');
writeFileSync(dotFile, lines.join('\n') + '\n');
console.log(
  `${nodes.size} units, ${uses.size} uses-links, ${events.length} event links in code, ${planned.length} planned -> ${relative(process.cwd(), dotFile)}`,
);
try {
  execFileSync('dot', ['-Tsvg', dotFile, '-o', join(outDir, 'module-graph.svg')]);
  execFileSync('dot', ['-Tpng', '-Gdpi=150', dotFile, '-o', join(outDir, 'module-graph.png')]);
  console.log('Rendered module-graph.svg and module-graph.png');
} catch {
  console.log(
    'Graphviz not found: install it (apt install graphviz / brew install graphviz) to render the picture.',
  );
}
