import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations } from './game/schema.js';
import { seedGameConfig } from './game/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ATLAS_DB_PATH points the app (and the tests) at another database file, e.g. a copy.
export const DB_PATH = process.env.ATLAS_DB_PATH
  ? path.resolve(process.env.ATLAS_DB_PATH)
  : path.join(root, 'data', 'atlas.db');
const dataDir = path.dirname(DB_PATH);
fs.mkdirSync(dataDir, { recursive: true });

if (!process.env.ATLAS_DB_PATH) migrateLegacyFile(path.join(dataDir, 'tasks.db'), DB_PATH);
export const db = new Database(DB_PATH);

/**
 * One-time rename of the old data/tasks.db (+ -wal/-shm) to data/atlas.db, without losing data.
 * Only runs when the old file exists and the new one doesn't. The WAL is checkpointed into the
 * main file first; leftovers are renamed before the main file, so an interruption at any point
 * still leaves a consistent pair for the next start.
 */
function migrateLegacyFile(oldPath, newPath) {
  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) return;
  const old = new Database(oldPath);
  old.pragma('wal_checkpoint(TRUNCATE)');
  old.close();
  for (const suffix of ['-wal', '-shm', '']) {
    if (fs.existsSync(oldPath + suffix)) fs.renameSync(oldPath + suffix, newPath + suffix);
  }
  console.log(`Renamed ${path.basename(oldPath)} to ${path.basename(newPath)}`);
}
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const STATUSES = ['backlog', 'todo', 'in_progress', 'blocked', 'done'];
export const PRIORITIES = ['high', 'medium', 'low'];

// A brand-new file needs no backup before the game migrations.
const isFresh = !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'").get();

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT NOT NULL DEFAULT '#9B9A97'
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'todo',
    priority   TEXT,
    due_date   TEXT,
    due_time   TEXT,
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    position   REAL NOT NULL DEFAULT 0,
    is_sample  INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS task_categories (
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, category_id)
  );
  CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    mode         TEXT NOT NULL,
    duration_sec INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    local_date   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Migration: a client-generated key makes recording a finished timer idempotent (several tabs).
if (!db.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get('pomodoro_sessions', 'session_key')) {
  db.exec('ALTER TABLE pomodoro_sessions ADD COLUMN session_key TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS pomodoro_sessions_key ON pomodoro_sessions(session_key)');

// v2 game tables (GAME_DESIGN.md §10), versioned with PRAGMA user_version.
export const migration = runMigrations(db, { backupDir: path.join(dataDir, 'backups'), isFresh });
seedGameConfig(db);

export const INITIAL_CATEGORIES = [
  { name: 'Comp and Rhetoric II', color: '#0B6E99' },
  { name: 'Intro CIS', color: '#6940A5' },
  { name: 'Physical Science I', color: '#D9730D' },
  { name: 'psychology', color: '#AD1A72' },
];

// Sample tasks (Task Name and Notes are free text and intentionally not translated).
const SAMPLE_TASKS = [
  { name: 'Quiz: binary & hexadecimal', status: 'todo', priority: 'medium', due: '2026-10-16', time: '09:00', cats: ['Intro CIS'], notes: 'Online quiz on the course portal.' },
  { name: 'Peer review for a classmate', status: 'done', priority: 'medium', due: '2026-10-16', cats: ['Comp and Rhetoric II'], notes: '' },
  { name: 'Read chapter 5 – Memory', status: 'todo', priority: 'medium', due: '2026-10-17', cats: ['psychology'], notes: 'Take notes on encoding vs. retrieval.' },
  { name: 'Density worksheet', status: 'in_progress', priority: 'low', due: '2026-10-19', cats: ['Physical Science I'], notes: '' },
  { name: 'Essay draft: rhetorical analysis', status: 'in_progress', priority: 'high', due: '2026-10-20', time: '23:59', cats: ['Comp and Rhetoric II'], notes: 'Thesis + 3 body paragraphs. Use at least 4 sources.' },
  { name: "Lab report: Newton's laws", status: 'todo', priority: 'high', due: '2026-10-22', time: '17:00', cats: ['Physical Science I'], notes: 'Include graphs from the cart experiment.' },
  { name: 'Midterm study guide', status: 'blocked', priority: 'high', due: '2026-10-24', cats: ['psychology', 'Physical Science I'], notes: 'Waiting for the professors to post the review topics.' },
  { name: 'Python loops exercises', status: 'backlog', priority: 'low', due: '2026-10-28', cats: ['Intro CIS'], notes: 'Exercises 4.1 – 4.12.' },
  { name: 'Annotated bibliography', status: 'backlog', priority: 'medium', due: '2026-11-03', cats: ['Comp and Rhetoric II'], notes: '' },
  { name: 'Research participation hours', status: 'backlog', priority: 'low', due: '2026-11-10', cats: ['psychology', 'Intro CIS'], notes: 'Sign up for 2 studies on SONA.' },
];

export function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

/**
 * Category id for a sample category, tracked by id (settings.sampleCategories: name → id) so that
 * renaming it (e.g. "Intro CIS" → "CIS 101") doesn't make a restore create a duplicate.
 * Only a category that no longer exists is recreated.
 */
function sampleCategoryId(name) {
  const ids = getSetting('sampleCategories', {});
  if (ids[name] && db.prepare('SELECT 1 FROM categories WHERE id = ?').get(ids[name])) return ids[name];
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  const color = INITIAL_CATEGORIES.find((c) => c.name === name)?.color ?? '#9B9A97';
  const id = row ? row.id : Number(db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(name, color).lastInsertRowid);
  setSetting('sampleCategories', { ...ids, [name]: id });
  return id;
}

/**
 * Adds the sample tasks that are missing (an untouched sample with the same name is kept as is).
 * Never deletes anything: a sample the user edited is no longer a sample (see markNotSample).
 */
export const insertSampleTasks = db.transaction(() => {
  const exists = db.prepare('SELECT 1 FROM tasks WHERE is_sample = 1 AND name = ?');
  const insertTask = db.prepare(`
    INSERT INTO tasks (name, status, priority, due_date, due_time, notes, created_at, position, is_sample)
    VALUES (@name, @status, @priority, @due, @time, @notes, @created, @position, 1)`);
  const link = db.prepare('INSERT OR IGNORE INTO task_categories (task_id, category_id) VALUES (?, ?)');
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM tasks WHERE status = ?');
  let inserted = 0;
  for (const t of SAMPLE_TASKS) {
    if (exists.get(t.name)) continue;
    inserted++;
    const position = maxPos.get(t.status).m + 1;
    const id = insertTask.run({ ...t, time: t.time ?? null, created: new Date().toISOString(), position }).lastInsertRowid;
    for (const c of t.cats) link.run(id, sampleCategoryId(c));
  }
  return inserted;
});

/** A sample task the user edits or tracks time against becomes their own task. */
export function markNotSample(taskId) {
  db.prepare('UPDATE tasks SET is_sample = 0 WHERE id = ? AND is_sample = 1').run(taskId);
}

export function removeSampleTasks() {
  return db.prepare('DELETE FROM tasks WHERE is_sample = 1').run().changes;
}

// Migration (DBs created before sample categories were tracked by id): map the ones that still exist.
if (getSetting('initialized', false) && !getSetting('sampleCategories', null)) {
  const map = {};
  for (const c of INITIAL_CATEGORIES) {
    const row = db.prepare('SELECT id FROM categories WHERE name = ? ORDER BY id LIMIT 1').get(c.name);
    if (row) map[c.name] = row.id;
  }
  setSetting('sampleCategories', map);
}

// First run: create the initial categories and the sample tasks.
if (!getSetting('initialized', false)) {
  db.transaction(() => {
    for (const c of INITIAL_CATEGORIES) sampleCategoryId(c.name);
    insertSampleTasks();
    setSetting('initialized', true);
  })();
}
