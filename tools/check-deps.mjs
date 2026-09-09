import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@brilliancy/';
const SPEC_SECTION = '§4.2';
const RULE_HOME = 'docs/spec/v1.1.md §4.2, summarised in CLAUDE.md section 5';

const PACKAGE_POLICY = {
  '@brilliancy/engine-protocol': [],
  '@brilliancy/chess-utils': [],
  '@brilliancy/openings': [],
  '@brilliancy/analysis-core': ['@brilliancy/engine-protocol', '@brilliancy/chess-utils'],
  '@brilliancy/db': [],
};

const MAX_PACKAGE_DEPTH = 2;

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

const violations = [];
const fail = (where, message) => violations.push({ where, message });

function readWorkspaceGlobs() {
  const file = join(REPO_ROOT, 'pnpm-workspace.yaml');
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.trimEnd() === 'packages:');
  if (start === -1) {
    throw new Error(`${file}: no top-level "packages:" key`);
  }

  const globs = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) break;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item === null) {
      throw new Error(`${file}: unparsable line inside "packages:": ${JSON.stringify(line)}`);
    }
    globs.push(item[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  if (globs.length === 0) {
    throw new Error(`${file}: "packages:" is empty`);
  }
  return globs;
}

function expandGlob(glob) {
  if (!glob.includes('*')) {
    return [glob];
  }
  const match = /^([^*]+)\/\*$/.exec(glob);
  if (match === null) {
    throw new Error(
      `pnpm-workspace.yaml: glob ${JSON.stringify(glob)} is neither "dir/*" nor a literal path. ` +
        'Extend expandGlob() in tools/check-deps.mjs rather than letting workspaces go unchecked.',
    );
  }
  const parent = join(REPO_ROOT, match[1]);
  let entries;
  try {
    entries = readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${match[1]}/${entry.name}`)
    .sort();
}

function readWorkspaces() {
  const found = new Map();
  for (const glob of readWorkspaceGlobs()) {
    for (const dir of expandGlob(glob)) {
      const manifestPath = join(REPO_ROOT, dir, 'package.json');
      try {
        statSync(manifestPath);
      } catch {
        continue;
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (typeof manifest.name !== 'string') {
        fail(`${dir}/package.json`, 'workspace manifest has no "name"');
        continue;
      }
      if (found.has(manifest.name)) {
        fail(`${dir}/package.json`, `duplicate workspace name "${manifest.name}"`);
        continue;
      }
      found.set(manifest.name, {
        name: manifest.name,
        dir,
        kind: dir.split('/')[0],
        manifest,
      });
    }
  }
  return found;
}

const workspaces = readWorkspaces();

const edges = new Map();
for (const ws of workspaces.values()) {
  const out = [];
  for (const field of DEP_FIELDS) {
    const block = ws.manifest[field];
    if (block === undefined || block === null) continue;
    for (const [to, spec] of Object.entries(block)) {
      if (to.startsWith(SCOPE)) out.push({ to, field, spec });
    }
  }
  edges.set(ws.name, out);
}

for (const ws of workspaces.values()) {
  if (ws.kind === 'packages' && !Object.hasOwn(PACKAGE_POLICY, ws.name)) {
    fail(
      ws.dir,
      `"${ws.name}" has no entry in PACKAGE_POLICY (tools/check-deps.mjs).\n` +
        '    Adding a package means stating what it may import. Add an entry — [] for a leaf —\n' +
        '    and record in CLAUDE.md section 5 which spec section permits each edge.',
    );
  }
}

for (const ws of workspaces.values()) {
  for (const edge of edges.get(ws.name)) {
    const target = workspaces.get(edge.to);
    const at = `${ws.dir}/package.json`;

    if (target === undefined) {
      fail(
        at,
        `"${ws.name}" depends on "${edge.to}", which is not a workspace in this repository.\n` +
          '    Either the name is wrong, or the dependency was added before the package existed.',
      );
      continue;
    }

    if (!edge.spec.startsWith('workspace:')) {
      fail(
        at,
        `"${ws.name}" -> "${edge.to}" is declared as ${JSON.stringify(edge.spec)}.\n` +
          '    Internal dependencies must use the "workspace:" protocol so a published\n' +
          '    package can never be silently substituted for the local one.',
      );
    }

    if (ws.kind === 'packages') {
      const allowed = PACKAGE_POLICY[ws.name];
      if (allowed !== undefined && !allowed.includes(edge.to)) {
        const permitted = allowed.length === 0 ? 'nothing' : allowed.join(', ');
        fail(
          at,
          `"${ws.name}" -> "${edge.to}" is not a permitted edge (${SPEC_SECTION}).\n` +
            `    ${ws.name} may depend on: ${permitted}.\n` +
            '    If the spec permits this edge, widen PACKAGE_POLICY in tools/check-deps.mjs\n' +
            '    and record the section that allows it in CLAUDE.md section 5. Never silently.',
        );
      }
      if (target.kind !== 'packages') {
        fail(
          at,
          `"${ws.name}" (packages/) -> "${edge.to}" (${target.kind}/) inverts the layering (${SPEC_SECTION}).\n` +
            '    Shared packages may not depend on an app or a tool.',
        );
      }
    }

    if (ws.kind === 'apps' && target.kind === 'apps') {
      fail(
        at,
        `"${ws.name}" -> "${edge.to}": one app may not depend on another (${SPEC_SECTION}).\n` +
          '    apps/web, apps/api and apps/engine-worker are separate deployables;\n' +
          '    anything they share belongs in packages/.',
      );
    }

    if (ws.kind === 'tools' && target.kind === 'apps') {
      fail(
        at,
        `"${ws.name}" (tools/) -> "${edge.to}": a tool may not depend on an app (${SPEC_SECTION}).`,
      );
    }
  }
}

const UNVISITED = 0;
const ON_STACK = 1;
const SETTLED = 2;
const state = new Map([...workspaces.keys()].map((name) => [name, UNVISITED]));

function findCycle(name, stack) {
  state.set(name, ON_STACK);
  stack.push(name);
  for (const edge of edges.get(name) ?? []) {
    if (!workspaces.has(edge.to)) continue;
    if (state.get(edge.to) === ON_STACK) {
      return [...stack.slice(stack.indexOf(edge.to)), edge.to];
    }
    if (state.get(edge.to) === UNVISITED) {
      const cycle = findCycle(edge.to, stack);
      if (cycle !== null) return cycle;
    }
  }
  stack.pop();
  state.set(name, SETTLED);
  return null;
}

for (const name of workspaces.keys()) {
  if (state.get(name) !== UNVISITED) continue;
  const cycle = findCycle(name, []);
  if (cycle !== null) {
    fail(
      'workspace graph',
      `dependency cycle (${SPEC_SECTION} requires an acyclic graph):\n    ${cycle.join(' -> ')}`,
    );
    break;
  }
}

if (violations.length === 0) {
  const longest = new Map();
  const longestPathFrom = (name) => {
    const cached = longest.get(name);
    if (cached !== undefined) return cached;
    longest.set(name, { depth: 0, path: [name] });
    let best = { depth: 0, path: [name] };
    for (const edge of edges.get(name) ?? []) {
      const target = workspaces.get(edge.to);
      if (target === undefined || target.kind !== 'packages') continue;
      const below = longestPathFrom(edge.to);
      if (below.depth + 1 > best.depth) {
        best = { depth: below.depth + 1, path: [name, ...below.path] };
      }
    }
    longest.set(name, best);
    return best;
  };

  for (const ws of workspaces.values()) {
    if (ws.kind !== 'packages') continue;
    const { depth, path } = longestPathFrom(ws.name);
    if (depth > MAX_PACKAGE_DEPTH) {
      fail(
        ws.dir,
        `dependency chain is ${depth} edges deep; ${SPEC_SECTION} requires the package graph ` +
          `to stay shallow (limit ${MAX_PACKAGE_DEPTH}):\n    ${path.join(' -> ')}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error(
    `check:deps: ${violations.length} violation(s) of the ${SPEC_SECTION} package graph\n`,
  );
  for (const { where, message } of violations) {
    console.error(`  ${where}:\n    ${message}\n`);
  }
  console.error(`The rule lives in ${RULE_HOME}, and is enforced by tools/check-deps.mjs.`);
  process.exit(1);
}

const rows = [...workspaces.values()].sort((a, b) => a.dir.localeCompare(b.dir));
console.log(
  `check:deps: ${rows.length} workspaces, ${[...edges.values()].flat().length} internal edges`,
);
for (const ws of rows) {
  const out = edges.get(ws.name).map((edge) => edge.to.replace(SCOPE, ''));
  console.log(`  ${ws.dir.padEnd(28)} -> ${out.length === 0 ? '(none)' : out.join(', ')}`);
}
console.log(
  `\nOK: acyclic, within depth ${MAX_PACKAGE_DEPTH}, every edge permitted by ${SPEC_SECTION}.`,
);
