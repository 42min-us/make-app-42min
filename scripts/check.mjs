#!/usr/bin/env node
// Checks the source against Make's review prerequisites before a deploy.
//
//   node scripts/check.mjs
import { base, connection, groups } from '../src/app.mjs';
import { modules } from '../src/modules.mjs';
import { rpcs } from '../src/rpcs.mjs';

const SEARCH = 9;
const UNIVERSAL = 12;
const problems = [];
const fail = (msg) => problems.push(msg);

const json = (v) => JSON.stringify(v);
const params = (m) => [...(m.expect ?? []), ...(m.parameters ?? [])];

// Base and connection
if (!base.log?.sanitize?.length) fail('base: the authorization header is not sanitized');
if (!base.response?.error?.message) fail('base: no error handling');
if (!connection.api?.log?.sanitize?.length) fail('connection: credentials are not sanitized');
if (!connection.api?.response?.error?.message) fail('connection: no error handling');
if (!connection.parameters?.length) fail('connection: no parameters');

// Modules
const names = new Set();
for (const m of modules) {
  if (!/^[a-zA-Z][0-9a-zA-Z]+[0-9a-zA-Z]$/.test(m.name) || m.name.length < 3 || m.name.length > 48) {
    fail(`${m.name}: name does not match Make's pattern`);
  }
  if (names.has(m.name)) fail(`${m.name}: duplicate module name`);
  names.add(m.name);
  if (!m.label) fail(`${m.name}: no label`);
  if (m.label && m.label !== m.label[0].toUpperCase() + m.label.slice(1)) fail(`${m.name}: label is not sentence case`);
  if (!m.description?.endsWith('.')) fail(`${m.name}: description should be a sentence ending in a period`);
  if (!m.interface?.length) fail(`${m.name}: no interface`);

  const ps = params(m);
  const limit = ps.find((p) => p.name === 'limit');
  if (m.typeId === SEARCH) {
    if (!limit) fail(`${m.name}: search module without a limit parameter`);
    if (limit?.required) fail(`${m.name}: limit must not be required in a search module`);
    if (limit?.advanced) fail(`${m.name}: limit must never be advanced`);
    const api = [m.api].flat();
    if (!api.some((r) => r.response?.iterate)) fail(`${m.name}: search module does not iterate`);
  } else if (m.typeId !== UNIVERSAL) {
    const api = [m.api].flat();
    if (api.some((r) => r.response?.iterate || r.pagination)) {
      fail(`${m.name}: only search modules may iterate or paginate`);
    }
  }

  for (const p of ps) {
    if (!p.label) fail(`${m.name}.${p.name}: no label`);
    if (p.type === 'date' && !json(m.api).includes(`parameters.${p.name}`)) {
      fail(`${m.name}.${p.name}: date parameter is not used in the request`);
    }
  }
  // Dates must be formatted explicitly, never passed through raw.
  for (const p of ps.filter((x) => x.type === 'date')) {
    if (!json(m.api).includes(`formatDate(parameters.${p.name}`)) {
      fail(`${m.name}.${p.name}: date is not formatted with formatDate`);
    }
  }
}

// The universal module must not let the user choose the host.
const universal = modules.filter((m) => m.typeId === UNIVERSAL);
if (universal.length !== 1) fail(`expected exactly one universal module, found ${universal.length}`);
for (const m of universal) {
  if (!/^__API_ORIGIN__\//.test(m.api.url)) fail(`${m.name}: universal URL must be the fixed origin plus a user path`);
  if (m.label !== 'Make an API call') fail(`${m.name}: universal module label must be "Make an API call"`);
}

// RPCs
for (const r of rpcs) {
  const api = [r.api].flat();
  if (!api.some((x) => x.response?.limit)) fail(`${r.name}: RPC without a limit`);
  if (!api.some((x) => x.pagination)) fail(`${r.name}: RPC without pagination`);
}

// Every module appears in exactly one group
const grouped = groups.flatMap((g) => g.modules);
for (const m of modules) if (!grouped.includes(m.name)) fail(`${m.name}: not listed in any group`);
for (const g of grouped) if (!names.has(g)) fail(`group references unknown module ${g}`);

if (problems.length) {
  console.error(`${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`ok: ${modules.length} modules, ${rpcs.length} RPC(s)`);
