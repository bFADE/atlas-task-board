// Category → attribute mapping (GAME_DESIGN.md §2).

/** Starting suggestions from §2, matched by category name (case-insensitive). */
export const CATEGORY_SUGGESTIONS = [
  ['Intro CIS', 'INT', null],
  ['Physical Science I', 'INT', 'SENSE'],
  ['Comp and Rhetoric II', 'SENSE', 'CHA'],
  ['psychology', 'SENSE', 'INT'],
  ['Gym', 'STR', 'VIT'],
  ['Muay Thai', 'AGI', 'STR'],
  ['Theology / Bible', 'FAITH', 'SENSE'],
  ['Silver Films / bFADE', 'CHA', 'SENSE'],
  ['Health', 'VIT', null],
  ['Rest / Mental health', 'MIND', null],
];

/**
 * Applies the suggested mapping to a category if its name matches one and it has no mapping yet.
 * Used when the game tables are created (existing categories) and when a category is created.
 */
export function applySuggestion(db, categoryId, name) {
  const s = CATEGORY_SUGGESTIONS.find(([n]) => n.toLowerCase() === String(name).trim().toLowerCase());
  if (!s) return;
  db.prepare(
    'INSERT OR IGNORE INTO category_attributes (category_id, primary_attribute, secondary_attribute) VALUES (?, ?, ?)',
  ).run(categoryId, s[1], s[2]);
}
