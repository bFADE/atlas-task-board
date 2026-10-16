import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db,
  STATUSES,
  PRIORITIES,
  getSetting,
  setSetting,
  insertSampleTasks,
  removeSampleTasks,
  markNotSample,
} from './db.js';

const PORT = Number(process.env.PORT) || 3001;
const app = express();
app.disable('x-powered-by');

/** Same limits as the UI (src/lib/types.ts, maxLength on the inputs). */
const MAX_NAME = 300;
const MAX_NOTES = 50_000;
// DNS-rebinding guard: only answer requests addressed to this machine by name or loopback IP
// (the Vite proxy forwards the browser's Host, e.g. localhost:5173).
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);
app.use((req, res, next) => {
  const hostname = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_HOSTNAMES.has(hostname)) return res.status(403).json({ error: 'forbidden_host' });
  next();
});

app.use(express.json({ limit: '1mb' }));

const DEFAULT_POMODORO = { pomodoro: 25, short: 5, long: 15, custom: 10, autoCycle: false };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD that exists on the calendar (rejects 2026-02-30, 2026-13-45, …). */
function isRealDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

const wrap = (fn) => (req, res, next) => {
  try {
    const out = fn(req, res);
    if (out !== undefined) res.json(out);
    // A handler must either return a body or respond itself; never leave the request hanging.
    else if (!res.headersSent) throw new Error(`No response from ${req.method} ${req.path}`);
  } catch (err) {
    next(err);
  }
};

// ---------- Tasks ----------

function serializeTasks(rows) {
  const links = db.prepare('SELECT task_id, category_id FROM task_categories').all();
  const byTask = new Map();
  for (const l of links) {
    if (!byTask.has(l.task_id)) byTask.set(l.task_id, []);
    byTask.get(l.task_id).push(l.category_id);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    dueTime: r.due_time,
    notes: r.notes,
    createdAt: r.created_at,
    position: r.position,
    isSample: !!r.is_sample,
    categoryIds: byTask.get(r.id) ?? [],
  }));
}

function getTask(id) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'task_not_found');
  return serializeTasks([row])[0];
}

/** Validates the writable fields of a task body and maps them to DB columns. */
/** `current` is the stored row on PATCH, so a time is never kept on a task without a date. */
function taskFields(body, { partial, current = null }) {
  const out = {};
  if ('name' in body || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new HttpError(400, 'name_required');
    if (name.length > MAX_NAME) throw new HttpError(400, 'name_too_long');
    out.name = name;
  }
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'invalid_status');
    out.status = body.status;
  }
  if ('priority' in body) {
    if (body.priority !== null && !PRIORITIES.includes(body.priority)) throw new HttpError(400, 'invalid_priority');
    out.priority = body.priority;
  }
  if ('dueDate' in body) {
    if (body.dueDate !== null && !isRealDate(body.dueDate)) throw new HttpError(400, 'invalid_date');
    out.due_date = body.dueDate;
  }
  if ('dueTime' in body) {
    if (body.dueTime !== null && (typeof body.dueTime !== 'string' || !TIME_RE.test(body.dueTime))) {
      throw new HttpError(400, 'invalid_time');
    }
    out.due_time = body.dueTime;
  }
  // A time only makes sense with a date: drop it when the task ends up without one.
  const dateAfter = 'due_date' in out ? out.due_date : current?.due_date ?? null;
  if (dateAfter === null && ('due_time' in out || 'due_date' in out)) out.due_time = null;
  if ('notes' in body) {
    out.notes = String(body.notes ?? '');
    if (out.notes.length > MAX_NOTES) throw new HttpError(400, 'notes_too_long');
  }
  if ('position' in body) {
    if (typeof body.position !== 'number' || !Number.isFinite(body.position)) throw new HttpError(400, 'invalid_position');
    out.position = body.position;
  }
  return out;
}

function setTaskCategories(taskId, categoryIds) {
  if (!Array.isArray(categoryIds)) throw new HttpError(400, 'invalid_categories');
  db.prepare('DELETE FROM task_categories WHERE task_id = ?').run(taskId);
  const link = db.prepare('INSERT OR IGNORE INTO task_categories (task_id, category_id) SELECT ?, id FROM categories WHERE id = ?');
  for (const cid of categoryIds) link.run(taskId, cid);
}

app.get('/api/tasks', wrap(() => serializeTasks(db.prepare('SELECT * FROM tasks ORDER BY position').all())));

app.post('/api/tasks', wrap((req, res) => {
  const fields = taskFields(req.body, { partial: false });
  fields.status ??= 'todo';
  const id = db.transaction(() => {
    if (fields.position === undefined) {
      fields.position = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM tasks WHERE status = ?').get(fields.status).p;
    }
    fields.created_at = new Date().toISOString();
    const cols = Object.keys(fields);
    const newId = db.prepare(`INSERT INTO tasks (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`)
      .run(fields).lastInsertRowid;
    if (req.body.categoryIds) setTaskCategories(newId, req.body.categoryIds);
    return newId;
  })();
  res.status(201).json(getTask(id));
}));

app.patch('/api/tasks/:id', wrap((req) => {
  const id = Number(req.params.id);
  getTask(id); // 404 if missing
  const current = db.prepare('SELECT due_date FROM tasks WHERE id = ?').get(id);
  const fields = taskFields(req.body, { partial: true, current });
  db.transaction(() => {
    const cols = Object.keys(fields);
    if (cols.length) {
      db.prepare(`UPDATE tasks SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...fields, id });
    }
    if ('categoryIds' in req.body) setTaskCategories(id, req.body.categoryIds);
    markNotSample(id);
  })();
  return getTask(id);
}));

app.post('/api/tasks/bulk-delete', wrap((req) => {
  const ids = req.body.ids;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id))) throw new HttpError(400, 'invalid_ids');
  const del = db.prepare('DELETE FROM tasks WHERE id = ?');
  const removed = db.transaction(() => ids.reduce((n, id) => n + del.run(id).changes, 0))();
  return { removed };
}));

app.delete('/api/tasks/:id', wrap((req, res) => {
  const { changes } = db.prepare('DELETE FROM tasks WHERE id = ?').run(Number(req.params.id));
  if (!changes) throw new HttpError(404, 'task_not_found');
  res.status(204).end();
}));

// ---------- Categories ----------

app.get('/api/categories', wrap(() => db.prepare('SELECT id, name, color FROM categories ORDER BY id').all()));

function categoryFields(body, { partial }) {
  const out = {};
  if ('name' in body || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) throw new HttpError(400, 'name_required');
    out.name = name;
  }
  if ('color' in body) {
    if (!COLOR_RE.test(body.color)) throw new HttpError(400, 'invalid_color');
    out.color = body.color;
  }
  return out;
}

function uniqueGuard(fn) {
  try {
    return fn();
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'category_exists');
    throw err;
  }
}

app.post('/api/categories', wrap((req, res) => {
  const f = categoryFields(req.body, { partial: false });
  const id = uniqueGuard(() =>
    db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(f.name, f.color ?? '#9B9A97').lastInsertRowid);
  res.status(201).json(db.prepare('SELECT id, name, color FROM categories WHERE id = ?').get(id));
}));

app.patch('/api/categories/:id', wrap((req) => {
  const id = Number(req.params.id);
  const getCategory = () => db.prepare('SELECT id, name, color FROM categories WHERE id = ?').get(id);
  if (!getCategory()) throw new HttpError(404, 'category_not_found');
  const f = categoryFields(req.body, { partial: true });
  const cols = Object.keys(f);
  if (cols.length) {
    uniqueGuard(() =>
      db.prepare(`UPDATE categories SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...f, id }));
  }
  return getCategory();
}));

app.delete('/api/categories/:id', wrap((req, res) => {
  const { changes } = db.prepare('DELETE FROM categories WHERE id = ?').run(Number(req.params.id));
  if (!changes) throw new HttpError(404, 'category_not_found');
  res.status(204).end();
}));

// ---------- Settings ----------

/** Saved board column order; falls back to the default order if missing or stale. */
function boardColumns() {
  const saved = getSetting('boardColumns', null);
  return Array.isArray(saved) && saved.length === STATUSES.length && STATUSES.every((s) => saved.includes(s))
    ? saved
    : STATUSES;
}

const allSettings = () => ({
  pomodoro: { ...DEFAULT_POMODORO, ...getSetting('pomodoro', {}) },
  boardColumns: boardColumns(),
});

app.get('/api/settings', wrap(allSettings));

app.put('/api/settings', wrap((req) => {
  if ('boardColumns' in req.body) {
    const cols = req.body.boardColumns;
    const valid = Array.isArray(cols) && cols.length === STATUSES.length && STATUSES.every((s) => cols.includes(s));
    if (!valid) throw new HttpError(400, 'invalid_columns');
    setSetting('boardColumns', cols);
  }
  const p = req.body.pomodoro ?? {};
  const current = { ...DEFAULT_POMODORO, ...getSetting('pomodoro', {}) };
  for (const key of ['pomodoro', 'short', 'long', 'custom']) {
    if (key in p) {
      const n = Number(p[key]);
      if (!Number.isFinite(n) || n < 1 || n > 600) throw new HttpError(400, 'invalid_duration');
      current[key] = Math.round(n);
    }
  }
  if ('autoCycle' in p) current.autoCycle = !!p.autoCycle;
  setSetting('pomodoro', current);
  return allSettings();
}));

// ---------- Pomodoro sessions ----------

app.post('/api/sessions', wrap((req, res) => {
  const { taskId = null, mode, durationSec, localDate, sessionKey = null } = req.body;
  if (sessionKey !== null && (typeof sessionKey !== 'string' || !sessionKey || sessionKey.length > 64)) {
    throw new HttpError(400, 'invalid_session_key');
  }
  if (!['pomodoro', 'custom'].includes(mode)) throw new HttpError(400, 'invalid_mode');
  if (!isRealDate(localDate)) throw new HttpError(400, 'invalid_date');
  // 1 s … 10 h (the longest timer the UI allows is 600 min).
  if (!Number.isInteger(durationSec) || durationSec < 1 || durationSec > 36_000) throw new HttpError(400, 'invalid_duration');
  const dur = durationSec;
  if (taskId !== null && !(Number.isInteger(taskId) && taskId > 0)) throw new HttpError(400, 'invalid_task');
  const exists = taskId != null && db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(taskId);
  // Same sessionKey twice (e.g. two tabs) → stored once.
  const { changes } = db
    .prepare(`INSERT OR IGNORE INTO pomodoro_sessions (task_id, mode, duration_sec, completed_at, local_date, session_key)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(exists ? taskId : null, mode, dur, new Date().toISOString(), localDate, sessionKey);
  if (exists) markNotSample(taskId);
  res.status(changes ? 201 : 200).json({ ok: true, duplicate: !changes });
}));

app.get('/api/sessions/summary', wrap((req) => {
  const date = String(req.query.date ?? '');
  if (!isRealDate(date)) throw new HttpError(400, 'invalid_date');
  const sessions = db.prepare(`
    SELECT s.id, s.mode, s.duration_sec AS durationSec, s.completed_at AS completedAt, s.task_id AS taskId, t.name AS taskName
    FROM pomodoro_sessions s LEFT JOIN tasks t ON t.id = s.task_id
    WHERE s.local_date = ? ORDER BY s.completed_at DESC`).all(date);
  return {
    pomodoros: sessions.filter((s) => s.mode === 'pomodoro').length,
    focusMinutes: Math.round(sessions.reduce((a, s) => a + s.durationSec, 0) / 60),
    sessions,
  };
}));

// ---------- Sample data ----------

app.post('/api/sample', wrap(() => {
  return { inserted: insertSampleTasks() };
}));

app.delete('/api/sample', wrap(() => ({ removed: removeSampleTasks() })));

// ---------- Errors / static ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

// Serve the production build when it exists (npm run build && npm start).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
