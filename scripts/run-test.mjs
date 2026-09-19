#!/usr/bin/env node
// Builds a throwaway scenario from a list of modules, runs it and prints what
// each module returned. This is how the app's modules are exercised without
// clicking them together in Make's editor.
//
//   node scripts/run-test.mjs cases/list-event-types.json
//   node scripts/run-test.mjs cases/list-event-types.json --keep
//
// A case file is {"name": "...", "flow": [{"module": "listEventTypes",
// "mapper": {...}}, ...]}. Mapper values may reference an earlier module's
// output the way Make does: "{{1.id}}". A step may carry a `filter`, which
// asserts: when it does not match, the rest of the chain does not run and the
// operation count gives it away.
//
// Needs a Make token with scenarios:read, scenarios:write, scenarios:run and
// connections:read, in /root/.make-test-token.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const state = JSON.parse(await readFile(path.join(ROOT, 'make-app.json'), 'utf8'));
const token = (process.env.MAKE_TEST_TOKEN || (await readFile('/root/.make-test-token', 'utf8'))).trim();
const ZONE = process.env.MAKE_ZONE || 'us2';
const API = `https://${ZONE}.make.com/api/v2`;
const TEAM = Number(process.env.MAKE_TEAM || 2979619);
const PKG = `app#${state.name}`;
const KEEP = process.argv.includes('--keep');

async function call(method, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: { authorization: `Token ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status} ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

async function connectionId() {
  const { connections } = await call('GET', `/connections?teamId=${TEAM}`);
  const mine = connections.filter((c) => c.packageName === PKG);
  if (!mine.length) throw new Error(`No connection for ${PKG}. Create one in Make first.`);
  return mine[0].id;
}

const blueprint = (name, flow, conn) => ({
  name,
  flow: flow.map((step, i) => ({
    id: i + 1,
    module: `${PKG}:${step.module}`,
    version: 1,
    parameters: { __IMTCONN__: conn },
    mapper: step.mapper ?? {},
    // A filter that fails stops the chain, so the operation count drops and
    // the harness reports it. That is how a case asserts on a value.
    ...(step.filter ? { filter: step.filter } : {}),
    metadata: { designer: { x: i * 300, y: 0 } },
  })),
  metadata: { instant: false, version: 1, scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true }, designer: { orphans: [] } },
});

async function main() {
  const caseFile = process.argv[2];
  if (!caseFile) throw new Error('usage: run-test.mjs <case.json> [--keep]');
  const testCase = JSON.parse(await readFile(path.resolve(ROOT, caseFile), 'utf8'));
  const conn = await connectionId();

  const created = await call('POST', '/scenarios', {
    teamId: TEAM,
    blueprint: JSON.stringify(blueprint(`42min test: ${testCase.name}`, testCase.flow, conn)),
    // On demand, so activating the scenario does not also start a scheduled run
    // racing the one the harness triggers.
    scheduling: JSON.stringify({ type: 'on-demand' }),
  });
  const id = created.scenario.id;
  console.log(`scenario ${id} (${testCase.name})`);

  try {
    // A scenario has to be active before the API will run it.
    await call('POST', `/scenarios/${id}/start`, {});
    const run = await call('POST', `/scenarios/${id}/run`, { responsive: true, data: {} });
    console.log(`run status ${run.status} (1 = success, 2 = warning, 3 = error)`);

    // The log list is written a moment after the run returns. `operations` is
    // the number of module operations that actually ran, which is what catches
    // a chain that "succeeded" only because an earlier module returned nothing.
    let entry;
    for (let i = 0; i < 10 && !entry; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { scenarioLogs = [] } = await call('GET', `/scenarios/${id}/logs`).catch(() => ({}));
      entry = scenarioLogs.find((l) => l.imtId?.includes(run.executionId) || l.id === run.executionId);
    }
    if (entry) {
      console.log(`operations ${entry.operations}, status ${entry.status}, ${entry.duration} ms`);
      if (entry.status !== 1) console.log(JSON.stringify(entry, null, 2).slice(0, 3000));
    } else {
      console.log('no log entry yet');
    }
    const expected = testCase.flow.length;
    if (entry && entry.operations < expected) {
      console.log(`WARNING: ${entry.operations} of ${expected} modules ran; an earlier module returned no bundles`);
    }
  } finally {
    await call('POST', `/scenarios/${id}/stop`, {}).catch(() => {});
    if (KEEP) console.log(`kept: https://${ZONE}.make.com/${TEAM}/scenarios/${id}/edit`);
    else await call('DELETE', `/scenarios/${id}`);
  }
}

await main();
