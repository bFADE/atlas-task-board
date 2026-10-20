// Task serialization shared by the task and stage routes.
import { db } from './db.js';
import { HttpError } from './http.js';

const serializeStage = (s) => ({
  id: s.id,
  title: s.title,
  done: !!s.done,
  position: s.position,
  completedAt: s.completed_at,
});

/** Rows of `tasks` → API objects, with category ids and ordered stages. */
export function serializeTasks(rows) {
  const byTask = new Map();
  const bucket = (id) => {
    if (!byTask.has(id)) byTask.set(id, { categoryIds: [], stages: [] });
    return byTask.get(id);
  };
  for (const l of db.prepare('SELECT task_id, category_id FROM task_categories').all()) bucket(l.task_id).categoryIds.push(l.category_id);
  for (const s of db.prepare('SELECT * FROM task_stages ORDER BY task_id, position, id').all()) bucket(s.task_id).stages.push(serializeStage(s));
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
    categoryIds: byTask.get(r.id)?.categoryIds ?? [],
    stages: byTask.get(r.id)?.stages ?? [],
  }));
}

export function getTask(id) {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'task_not_found');
  return serializeTasks([row])[0];
}
