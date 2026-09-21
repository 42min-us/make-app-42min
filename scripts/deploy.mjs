#!/usr/bin/env node
// Pushes the app in src/ to Make through the SDK Apps API.
//
//   node scripts/deploy.mjs              # deploy against production
//   API_ORIGIN=https://pre.42min.us node scripts/deploy.mjs
//   node scripts/deploy.mjs --dry-run    # print what would be sent
//
// The token is read from /root/.make-api-token (or MAKE_TOKEN) and is never
// printed. It needs the scopes sdk-apps:read and sdk-apps:write.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app as appMeta, base, connection, groups } from '../src/app.mjs';
import { modules } from '../src/modules.mjs';
import { rpcs } from '../src/rpcs.mjs';
import { webhooks, signatureProbe } from '../src/webhooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE_FILE = path.join(ROOT, 'make-app.json');
const TOKEN_FILE = process.env.MAKE_TOKEN_FILE || '/root/.make-api-token';
const ZONE = process.env.MAKE_ZONE || 'us2';
const API = `https://${ZONE}.make.com/api/v2`;
const API_ORIGIN = (process.env.API_ORIGIN || 'https://api.42min.us').replace(/\/+$/, '');
const DRY = process.argv.includes('--dry-run');

const token = (process.env.MAKE_TOKEN || (await readFile(TOKEN_FILE, 'utf8'))).trim();
if (!token) throw new Error(`No Make API token in ${TOKEN_FILE}`);

/** Substitute the API origin everywhere, so nothing ships with a placeholder. */
const withOrigin = (value) => JSON.parse(JSON.stringify(value).split('__API_ORIGIN__').join(API_ORIGIN));

async function call(method, urlPath, body, contentType = 'application/json') {
  const url = `${API}${urlPath}`;
  if (DRY && method !== 'GET') {
    console.log(`${method} ${urlPath}`, body === undefined ? '' : JSON.stringify(body).slice(0, 200));
    return {};
  }
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Token ${token}`,
      ...(body === undefined ? {} : { 'content-type': contentType }),
    },
    body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(await readFile(STATE_FILE, 'utf8'));
}

async function ensureApp(state) {
  if (state?.name) {
    console.log(`app ${state.name} v${state.version}`);
    return state;
  }
  const created = await call('POST', '/sdk/apps', { name: 'fortytwomin', ...appMeta });
  if (DRY) return { name: '<new-app>', version: 1 };
  const a = created.app ?? created;
  const next = { name: a.name, version: a.version ?? 1, label: a.label };
  await writeFile(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`created app ${next.name} v${next.version}`);
  return next;
}

async function ensureConnection(state) {
  if (state.connection) return state.connection;
  if (DRY) return "<new-connection>";
  const created = await call('POST', `/sdk/apps/${state.name}/connections`, {
    type: connection.type,
    label: connection.label,
  });
  const name = (created.appConnection ?? created.connection ?? created).name;
  state.connection = name;
  await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  console.log(`created connection ${name}`);
  return name;
}

const listNames = (payload, key) => (payload[key] ?? payload ?? []).map((x) => x.name);

async function main() {
  let state = await loadState();
  state = await ensureApp(state);
  const { name, version } = state;
  const conn = await ensureConnection(state);

  // Connection
  await call('PUT', `/sdk/apps/connections/${conn}/parameters`, withOrigin(connection.parameters));
  await call('PUT', `/sdk/apps/connections/${conn}/api`, withOrigin(connection.api));

  // Base
  await call('PUT', `/sdk/apps/${name}/${version}/base`, withOrigin(base));

  // Webhooks, before the modules that bind to them. Make names a webhook
  // itself (the first one takes the app's own name), so ours are matched by
  // label and the mapping is kept in make-app.json.
  state.webhooks ??= {};
  const remoteHooks = async () => (await call('GET', `/sdk/apps/${name}/webhooks`)).appWebhooks ?? [];
  for (const w of webhooks) {
    if (!state.webhooks[w.name]) {
      const before = DRY ? [] : await remoteHooks();
      let hook = before.find((h) => h.label === w.label);
      if (!hook) {
        await call('POST', `/sdk/apps/${name}/webhooks`, { type: w.type, label: w.label, connection: conn });
        hook = DRY ? { name: `<${w.name}>` } : (await remoteHooks()).find((h) => h.label === w.label);
      }
      state.webhooks[w.name] = hook.name;
      if (!DRY) await writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
    }
    const remote = state.webhooks[w.name];
    const putHook = (section, payload) =>
      call('PUT', `/sdk/apps/webhooks/${remote}/${section}`, withOrigin(payload));
    const api =
      process.env.SIGNATURE_PROBE === '1' && w.name === 'watchBookingsHook'
        ? { ...w.api, output: { ...w.api.output, ...signatureProbe } }
        : w.api;
    await putHook('api', api);
    await putHook('parameters', w.parameters ?? []);
    await putHook('attach', w.attach);
    await putHook('detach', w.detach);
    console.log(`webhook ${w.name} -> ${remote}`);
  }

  // Modules
  const existing = DRY ? [] : listNames(await call('GET', `/sdk/apps/${name}/${version}/modules`), 'appModules');
  for (const m of modules) {
    if (!existing.includes(m.name)) {
      await call('POST', `/sdk/apps/${name}/${version}/modules`, {
        name: m.name,
        typeId: m.typeId,
        label: m.label,
        description: m.description,
        ...(m.webhook ? { webhook: state.webhooks[m.webhook] } : { connection: conn }),
        moduleInitMode: 'blank',
        ...(m.crud ? { crud: m.crud } : {}),
      });
    } else {
      await call('PATCH', `/sdk/apps/${name}/${version}/modules/${m.name}`, {
        label: m.label,
        description: m.description,
        // A trigger belongs to its webhook, which carries the connection.
        ...(m.webhook ? {} : { connection: conn }),
      });
    }
    const put = (section, payload) =>
      call('PUT', `/sdk/apps/${name}/${version}/modules/${m.name}/${section}`, withOrigin(payload));
    if (Object.keys(m.api ?? {}).length) await put('api', m.api);
    await put('parameters', m.parameters ?? []);
    if (!m.webhook) await put('expect', m.expect ?? []);
    await put('interface', m.interface ?? []);
    console.log(`module ${m.name}`);
  }

  // RPCs
  const existingRpcs = DRY ? [] : listNames(await call('GET', `/sdk/apps/${name}/${version}/rpcs`), 'appRpcs');
  for (const r of rpcs) {
    if (!existingRpcs.includes(r.name)) {
      await call('POST', `/sdk/apps/${name}/${version}/rpcs`, { name: r.name, label: r.label, connection: conn });
    }
    await call('PUT', `/sdk/apps/${name}/${version}/rpcs/${r.name}/api`, withOrigin(r.api));
    await call('PUT', `/sdk/apps/${name}/${version}/rpcs/${r.name}/parameters`, r.parameters ?? []);
    console.log(`rpc ${r.name}`);
  }

  // Module order in the app's menu
  await call('PUT', `/sdk/apps/${name}/${version}/groups`, groups);

  // App description and the documentation shown on the app's page
  await call('PATCH', `/sdk/apps/${name}/${version}`, { description: appMeta.description, theme: appMeta.theme });
  const readme = await readFile(path.join(ROOT, 'src', 'readme.md'));
  await call('PUT', `/sdk/apps/${name}/${version}/readme`, readme, 'text/markdown');

  // Icon
  const icon = await readFile(path.join(ROOT, 'assets', 'logo.png'));
  await call('PUT', `/sdk/apps/${name}/${version}/icon`, icon, 'image/png');

  console.log(`done, API origin ${API_ORIGIN}`);
}

await main();
