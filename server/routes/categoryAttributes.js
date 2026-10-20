import { Router } from 'express';
import { db } from '../db.js';
import { ATTRIBUTES } from '../game/schema.js';
import { HttpError, idParam, wrap } from '../http.js';

export const router = Router();

const serialize = (r) => ({ categoryId: r.category_id, primary: r.primary_attribute, secondary: r.secondary_attribute });
const list = () => db.prepare('SELECT * FROM category_attributes ORDER BY category_id').all().map(serialize);

function categoryId(param) {
  const id = idParam(param, 'category_not_found');
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id)) throw new HttpError(404, 'category_not_found');
  return id;
}

router.get('/', wrap(list));

/** Body: { primary: Attribute, secondary: Attribute | null }. */
router.put('/:categoryId', wrap((req) => {
  const id = categoryId(req.params.categoryId);
  const { primary, secondary = null } = req.body;
  if (!ATTRIBUTES.includes(primary)) throw new HttpError(400, 'invalid_attribute');
  if (secondary !== null && !ATTRIBUTES.includes(secondary)) throw new HttpError(400, 'invalid_attribute');
  if (secondary === primary) throw new HttpError(400, 'same_attribute');
  db.prepare(
    `INSERT INTO category_attributes (category_id, primary_attribute, secondary_attribute) VALUES (?, ?, ?)
     ON CONFLICT(category_id) DO UPDATE SET primary_attribute = excluded.primary_attribute,
                                           secondary_attribute = excluded.secondary_attribute`,
  ).run(id, primary, secondary);
  return serialize(db.prepare('SELECT * FROM category_attributes WHERE category_id = ?').get(id));
}));

router.delete('/:categoryId', wrap((req, res) => {
  const id = categoryId(req.params.categoryId);
  db.prepare('DELETE FROM category_attributes WHERE category_id = ?').run(id);
  res.status(204).end();
}));
