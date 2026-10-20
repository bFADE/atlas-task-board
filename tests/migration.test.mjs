// Migration of existing databases to the v2 game schema. Never touches data/atlas.db itself:
// it works on a read-only snapshot of it and on a database created by the v1 code (branch main).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { LIVE_DB, count, makeV1Database, openWithApp, snapshot, tables, tmpDir } from './helpers.mjs';

const GAME_TABLES = [
  'task_stages', 'appointments', 'xp_events', 'category_attributes', 'quest_templates', 'daily_quests',
  'penalties', 'rest_days', 'vacation_periods', 'debuffs', 'trials', 'game_config', 'player_profile',
];
const V1_TABLES = ['categories', 'tasks', 'task_categories', 'pomodoro_sessions', 'settings'];

function digest(dbPath) {
  const db = new Database(dbPath, { readonly: true });
  try {
    const out = {};
    for (const t of V1_TABLES) {
      out[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
    }
    return out;
  } finally {
    db.close();
  }
}

function checkMigrated(original, migratedPath) {
  const before = digest(original);
  const log = openWithApp(migratedPath);
  const db = new Database(migratedPath, { readonly: true });
  try {
    assert.equal(db.pragma('user_version', { simple: true }), 1, 'user_version is 1');
    const names = tables(db);
    for (const t of GAME_TABLES) assert.ok(names.includes(t), `table ${t} exists`);
    assert.deepEqual(digest(migratedPath), before, 'every v1 row is unchanged');
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.equal(count(db, 'quest_templates'), 4);
    assert.equal(count(db, 'player_profile'), 1);
  } finally {
    db.close();
  }
  // A backup of the pre-migration database was written next to it, with identical v1 data.
  const backups = fs.readdirSync(path.join(path.dirname(migratedPath), 'backups'));
  assert.equal(backups.length, 1, 'one backup');
  const backupPath = path.join(path.dirname(migratedPath), 'backups', backups[0]);
  assert.deepEqual(digest(backupPath), before, 'backup holds the original data');
  const bdb = new Database(backupPath, { readonly: true });
  assert.equal(bdb.pragma('user_version', { simple: true }), 0);
  bdb.close();
  return log;
}

test('migrates a snapshot of the current data/atlas.db without losing data', { skip: !fs.existsSync(LIVE_DB) && 'no data/atlas.db' }, () => {
  const dir = tmpDir('live');
  const original = snapshot(LIVE_DB, path.join(dir, 'original.db'));
  const copy = path.join(dir, 'work', 'atlas.db');
  fs.mkdirSync(path.dirname(copy));
  fs.copyFileSync(original, copy);
  const log = checkMigrated(original, copy);
  assert.match(log, /Backup written/);
  assert.match(log, /Migrated database to version 1/);
});

test('migrates a database created by v1 (branch main) with tasks, links and sessions', (t) => {
  const v1 = makeV1Database();
  if (!v1) return t.skip('git/main not available');
  // Add user data the v1 way, including sessions, links and a WAL that has not been checkpointed.
  const db = new Database(v1);
  db.prepare("INSERT INTO tasks (name, status, priority, notes, created_at, position) VALUES ('Mine', 'todo', 'high', 'ã 🍅', '2026-10-01T00:00:00Z', 1)").run();
  db.prepare('INSERT INTO task_categories (task_id, category_id) SELECT MAX(id), 1 FROM tasks').run();
  db.prepare("INSERT INTO pomodoro_sessions (task_id, mode, duration_sec, completed_at, local_date, session_key) VALUES (1, 'pomodoro', 1500, '2026-10-01T10:00:00Z', '2026-10-01', 'k1')").run();
  db.close();
  const dir = tmpDir('v1copy');
  const original = snapshot(v1, path.join(dir, 'original.db'));
  const copy = path.join(dir, 'work', 'atlas.db');
  fs.mkdirSync(path.dirname(copy));
  fs.copyFileSync(original, copy);
  checkMigrated(original, copy);
});

test('running the app again is a no-op (idempotent, no second backup)', () => {
  const v1 = makeV1Database();
  if (!v1) return;
  const copy = path.join(tmpDir('again'), 'atlas.db');
  fs.copyFileSync(snapshot(v1, copy + '.src'), copy);
  openWithApp(copy);
  const log = openWithApp(copy);
  assert.doesNotMatch(log, /Migrated|Backup/);
  assert.equal(fs.readdirSync(path.join(path.dirname(copy), 'backups')).length, 1);
});

test('a brand-new database gets the game tables and no backup', () => {
  const fresh = path.join(tmpDir('fresh'), 'atlas.db');
  const log = openWithApp(fresh);
  assert.doesNotMatch(log, /Backup/);
  assert.ok(!fs.existsSync(path.join(path.dirname(fresh), 'backups')));
  const db = new Database(fresh, { readonly: true });
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  for (const t of GAME_TABLES) assert.ok(tables(db).includes(t), t);
  assert.equal(count(db, 'tasks'), 10, 'first run still seeds the sample tasks');
  db.close();
});

test('schema constraints hold (end > start, attribute keys, unique XP key)', () => {
  const fresh = path.join(tmpDir('constraints'), 'atlas.db');
  openWithApp(fresh);
  const db = new Database(fresh);
  const now = '2026-10-20T00:00:00Z';
  assert.throws(() => db.prepare("INSERT INTO appointments (title, start_at, end_at, created_at, updated_at) VALUES ('x', '2026-10-20T10:00', '2026-10-20T09:00', ?, ?)").run(now, now), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO category_attributes (category_id, primary_attribute) VALUES (1, 'LUCK')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO category_attributes (category_id, primary_attribute, secondary_attribute) VALUES (1, 'INT', 'INT')").run(), /CHECK/);
  const xp = db.prepare("INSERT INTO xp_events (type, key, total_xp, day, created_at, updated_at) VALUES ('task_complete', 'task:1:complete', 20, '2026-10-20', ?, ?)");
  xp.run(now, now);
  assert.throws(() => xp.run(now, now), /UNIQUE/);
  assert.throws(() => db.prepare("INSERT INTO debuffs (kind, started_at) VALUES ('rusty', ?)").run(now), /CHECK/, 'rusty needs an attribute');
  db.close();
});
