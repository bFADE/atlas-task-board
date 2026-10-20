// Appointments (GAME_DESIGN.md §9): separate from tasks, with a start and an end.
// start/end are local wall-clock 'YYYY-MM-DDTHH:MM', the same convention as task due dates.
import { Router } from 'express';
import { db } from '../db.js';
import { APPOINTMENT_STATUSES } from '../game/schema.js';
import { HttpError, MAX_NOTES, idParam, isLocalDateTime, isRealDate, requiredText, wrap } from '../http.js';

export const MAX_APPOINTMENT_TITLE = 200;
export const MAX_LOCATION = 200;

export const router = Router();

const serialize = (r) => ({
  id: r.id,
  title: r.title,
  categoryId: r.category_id,
  start: r.start_at,
  end: r.end_at,
  location: r.location,
  notes: r.notes,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

function row(param) {
  const id = idParam(param, 'appointment_not_found');
  const r = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  if (!r) throw new HttpError(404, 'appointment_not_found');
  return r;
}

function optionalText(value, max, invalidCode, tooLongCode) {
  if (value === null) return '';
  if (typeof value !== 'string') throw new HttpError(400, invalidCode);
  if (value.length > max) throw new HttpError(400, tooLongCode);
  return value;
}

/** Validates the writable fields; `current` is the stored row on PATCH (for the end > start rule). */
function fields(body, { partial, current = null }) {
  const out = {};
  if ('title' in body || !partial) {
    out.title = requiredText(body.title, MAX_APPOINTMENT_TITLE, 'appointment_title_required', 'appointment_title_too_long');
  }
  if ('categoryId' in body) {
    const c = body.categoryId;
    if (c !== null && !(Number.isInteger(c) && c > 0 && db.prepare('SELECT 1 FROM categories WHERE id = ?').get(c))) {
      throw new HttpError(400, 'invalid_category');
    }
    out.category_id = c;
  }
  if ('start' in body || !partial) {
    if (!isLocalDateTime(body.start)) throw new HttpError(400, 'invalid_start');
    out.start_at = body.start;
  }
  if ('end' in body || !partial) {
    if (!isLocalDateTime(body.end)) throw new HttpError(400, 'invalid_end');
    out.end_at = body.end;
  }
  if ('location' in body) out.location = optionalText(body.location, MAX_LOCATION, 'invalid_location', 'location_too_long');
  if ('notes' in body) out.notes = optionalText(body.notes, MAX_NOTES, 'invalid_notes', 'notes_too_long');
  if ('status' in body) {
    if (!APPOINTMENT_STATUSES.includes(body.status)) throw new HttpError(400, 'invalid_appointment_status');
    out.status = body.status;
  }
  const start = out.start_at ?? current?.start_at;
  const end = out.end_at ?? current?.end_at;
  if (!(end > start)) throw new HttpError(400, 'end_before_start');
  return out;
}

// GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional, inclusive, by start day)
router.get('/', wrap((req) => {
  const { from, to } = req.query;
  if (from !== undefined && !isRealDate(from)) throw new HttpError(400, 'invalid_date');
  if (to !== undefined && !isRealDate(to)) throw new HttpError(400, 'invalid_date');
  return db
    .prepare(
      `SELECT * FROM appointments
       WHERE (@from IS NULL OR start_at >= @from) AND (@to IS NULL OR start_at < @toNext)
       ORDER BY start_at, id`,
    )
    .all({ from: from ?? null, to: to ?? null, toNext: to ? `${to}T99` : null })
    .map(serialize);
}));

router.get('/:id', wrap((req) => serialize(row(req.params.id))));

router.post('/', wrap((req, res) => {
  const f = fields(req.body, { partial: false });
  const now = new Date().toISOString();
  const record = { category_id: null, location: '', notes: '', status: 'planned', ...f, created_at: now, updated_at: now };
  const cols = Object.keys(record);
  const id = db.prepare(`INSERT INTO appointments (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`).run(record).lastInsertRowid;
  res.status(201).json(serialize(db.prepare('SELECT * FROM appointments WHERE id = ?').get(id)));
}));

router.patch('/:id', wrap((req) => {
  const current = row(req.params.id);
  const f = { ...fields(req.body, { partial: true, current }), updated_at: new Date().toISOString() };
  const cols = Object.keys(f);
  db.prepare(`UPDATE appointments SET ${cols.map((c) => `${c} = @${c}`).join(', ')} WHERE id = @id`).run({ ...f, id: current.id });
  return serialize(row(current.id));
}));

router.delete('/:id', wrap((req, res) => {
  const current = row(req.params.id);
  db.prepare('DELETE FROM appointments WHERE id = ?').run(current.id);
  res.status(204).end();
}));
