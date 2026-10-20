// Stages: ordered checklist inside a task (GAME_DESIGN.md §9). Every write returns the whole task,
// so the client can replace it (progress bars are computed from task.stages).
import { Router } from 'express';
import { db, markNotSample } from '../db.js';
import { HttpError, idParam, requiredText, wrap } from '../http.js';
import { getTask } from '../tasks.js';

export const MAX_STAGE_TITLE = 200;
export const MAX_STAGES = 100;

export const router = Router();

/** Validates a list of new stage titles (used when a task is created with stages). */
export function stageTitles(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'invalid_stages');
  if (value.length > MAX_STAGES) throw new HttpError(400, 'too_many_stages');
  return value.map((t) => requiredText(t, MAX_STAGE_TITLE, 'stage_title_required', 'stage_title_too_long'));
}

/** Appends stages to a task (inside the caller's transaction). */
export function insertStages(taskId, titles) {
  const { n, p } = db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(position), 0) AS p FROM task_stages WHERE task_id = ?').get(taskId);
  if (n + titles.length > MAX_STAGES) throw new HttpError(400, 'too_many_stages');
  const insert = db.prepare('INSERT INTO task_stages (task_id, title, position, created_at) VALUES (?, ?, ?, ?)');
  const now = new Date().toISOString();
  titles.forEach((title, i) => insert.run(taskId, title, p + i + 1, now));
}

function stageRow(param) {
  const id = idParam(param, 'stage_not_found');
  const row = db.prepare('SELECT * FROM task_stages WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'stage_not_found');
  return row;
}

function taskId(param) {
  const id = idParam(param, 'task_not_found');
  getTask(id); // 404 if missing
  return id;
}

// POST /api/tasks/:taskId/stages  { title }
router.post('/tasks/:taskId/stages', wrap((req, res) => {
  const id = taskId(req.params.taskId);
  const title = requiredText(req.body.title, MAX_STAGE_TITLE, 'stage_title_required', 'stage_title_too_long');
  db.transaction(() => {
    insertStages(id, [title]);
    markNotSample(id);
  })();
  res.status(201).json(getTask(id));
}));

// PUT /api/tasks/:taskId/stages/order  { ids: [...] } — must list every stage of the task exactly once.
router.put('/tasks/:taskId/stages/order', wrap((req) => {
  const id = taskId(req.params.taskId);
  const { ids } = req.body;
  const current = db.prepare('SELECT id FROM task_stages WHERE task_id = ?').all(id).map((r) => r.id);
  const valid =
    Array.isArray(ids) &&
    ids.length === current.length &&
    new Set(ids).size === ids.length &&
    ids.every((x) => Number.isInteger(x) && current.includes(x));
  if (!valid) throw new HttpError(400, 'invalid_stage_order');
  const setPos = db.prepare('UPDATE task_stages SET position = ? WHERE id = ?');
  db.transaction(() => {
    ids.forEach((sid, i) => setPos.run(i + 1, sid));
    markNotSample(id);
  })();
  return getTask(id);
}));

// PATCH /api/stages/:id  { title?, done? }
router.patch('/stages/:id', wrap((req) => {
  const row = stageRow(req.params.id);
  const fields = {};
  if ('title' in req.body) fields.title = requiredText(req.body.title, MAX_STAGE_TITLE, 'stage_title_required', 'stage_title_too_long');
  if ('done' in req.body) {
    if (typeof req.body.done !== 'boolean') throw new HttpError(400, 'invalid_stage_done');
    fields.done = req.body.done ? 1 : 0;
    // Keep the first completion time when re-saving a done stage.
    fields.completed_at = req.body.done ? row.completed_at ?? new Date().toISOString() : null;
  }
  const cols = Object.keys(fields);
  db.transaction(() => {
    if (cols.length) {
      db.prepare(`UPDATE task_stages SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...fields, id: row.id });
    }
    markNotSample(row.task_id);
  })();
  return getTask(row.task_id);
}));

// DELETE /api/stages/:id → the updated task
router.delete('/stages/:id', wrap((req) => {
  const row = stageRow(req.params.id);
  db.transaction(() => {
    db.prepare('DELETE FROM task_stages WHERE id = ?').run(row.id);
    markNotSample(row.task_id);
  })();
  return getTask(row.task_id);
}));
