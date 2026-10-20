// Every text lives in both languages: same keys in en.json and pt.json, every key used in the code
// exists, and every error code the API can return has a translation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const load = (lang) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'locales', `${lang}.json`), 'utf8'));
const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const files = (dir, ext) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name), ext) : ext.some((x) => e.name.endsWith(x)) ? [path.join(dir, e.name)] : [],
  );

const en = new Set(flat(load('en')));
const pt = new Set(flat(load('pt')));
const base = new Set([...en].map((k) => k.replace(/_(zero|one|other)$/, '')));

test('en.json and pt.json have exactly the same keys', () => {
  assert.deepEqual([...en].filter((k) => !pt.has(k)), [], 'missing in pt.json');
  assert.deepEqual([...pt].filter((k) => !en.has(k)), [], 'missing in en.json');
});

test('every static t() key used in src/ exists', () => {
  const missing = [];
  for (const f of files(path.join(ROOT, 'src'), ['.ts', '.tsx'])) {
    for (const [, key] of fs.readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([^'$]+)'/g)) {
      if (!base.has(key)) missing.push(`${path.relative(ROOT, f)}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every API error code has a translation', () => {
  const codes = new Set(['network', 'server_error']);
  for (const f of files(path.join(ROOT, 'server'), ['.js'])) {
    for (const [, code] of fs.readFileSync(f, 'utf8').matchAll(/HttpError\(\d+, '(\w+)'/g)) codes.add(code);
    for (const [, code] of fs.readFileSync(f, 'utf8').matchAll(/error: '(\w+)'/g)) codes.add(code);
  }
  assert.deepEqual([...codes].filter((c) => !en.has(`errors.${c}`)).sort(), []);
});

test('every attribute and appointment status has a label', async () => {
  const { ATTRIBUTES, APPOINTMENT_STATUSES } = await import('../server/game/schema.js');
  for (const a of ATTRIBUTES) assert.ok(en.has(`attributes.${a}`), a);
  for (const s of APPOINTMENT_STATUSES) assert.ok(en.has(`appointments.statuses.${s}`), s);
});
