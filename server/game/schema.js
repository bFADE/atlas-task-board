// Atlas v2 game schema (GAME_DESIGN.md §10). Stable English keys only; labels live in src/locales.
import fs from 'node:fs';
import path from 'node:path';

export const ATTRIBUTES = ['INT', 'SENSE', 'STR', 'AGI', 'VIT', 'MIND', 'FAITH', 'CHA', 'WILL', 'DISC'];
export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'];
export const APPOINTMENT_STATUSES = ['planned', 'attended', 'missed'];
export const XP_EVENT_STATUSES = ['active', 'revoked'];
export const QUEST_STATUSES = ['open', 'completed', 'failed', 'paused'];
export const PENALTY_STATUSES = ['open', 'completed', 'failed'];
export const DEBUFF_KINDS = ['fatigue', 'rusty'];

// Literal lists for CHECK constraints, built only from the constants above (never from input).
const inList = (values) => values.map((v) => `'${v}'`).join(', ');
const attrOrNull = (col) => `CHECK (${col} IS NULL OR ${col} IN (${inList(ATTRIBUTES)}))`;

/**
 * Ordered migrations; PRAGMA user_version stores the last one applied (v1 schema = 0).
 * Each runs in its own transaction. Migrations only add: they never drop or rewrite user data.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'game tables (phase 1)',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_stages (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title        TEXT NOT NULL,
          done         INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
          position     REAL NOT NULL DEFAULT 0,
          created_at   TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS task_stages_task ON task_stages(task_id, position);

        -- start_at / end_at: local wall-clock 'YYYY-MM-DDTHH:MM' (same convention as task due dates).
        CREATE TABLE IF NOT EXISTS appointments (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          title       TEXT NOT NULL,
          category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          start_at    TEXT NOT NULL,
          end_at      TEXT NOT NULL,
          location    TEXT NOT NULL DEFAULT '',
          notes       TEXT NOT NULL DEFAULT '',
          status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN (${inList(APPOINTMENT_STATUSES)})),
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL,
          CHECK (end_at > start_at)
        );
        CREATE INDEX IF NOT EXISTS appointments_start ON appointments(start_at);

        -- One row per grant. "key" makes every grant idempotent (e.g. task:42:complete).
        CREATE TABLE IF NOT EXISTS xp_events (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          type         TEXT NOT NULL,
          ref          TEXT,
          key          TEXT NOT NULL UNIQUE,
          total_xp     INTEGER NOT NULL DEFAULT 0,
          attribute    TEXT ${attrOrNull('attribute')},
          attribute_xp INTEGER NOT NULL DEFAULT 0,
          status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN (${inList(XP_EVENT_STATUSES)})),
          day          TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS xp_events_day ON xp_events(day);
        CREATE INDEX IF NOT EXISTS xp_events_attribute ON xp_events(attribute, day);

        CREATE TABLE IF NOT EXISTS category_attributes (
          category_id         INTEGER PRIMARY KEY REFERENCES categories(id) ON DELETE CASCADE,
          primary_attribute   TEXT NOT NULL CHECK (primary_attribute IN (${inList(ATTRIBUTES)})),
          secondary_attribute TEXT ${attrOrNull('secondary_attribute')},
          CHECK (secondary_attribute IS NULL OR secondary_attribute <> primary_attribute)
        );

        -- Structure of each quest; numeric targets and rewards live in game_config (quest.<key>.*).
        CREATE TABLE IF NOT EXISTS quest_templates (
          key            TEXT PRIMARY KEY,
          metric         TEXT NOT NULL,
          attribute      TEXT ${attrOrNull('attribute')},
          in_daily_clear INTEGER NOT NULL CHECK (in_daily_clear IN (0, 1)),
          sort_order     INTEGER NOT NULL,
          active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
        );

        CREATE TABLE IF NOT EXISTS daily_quests (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          day          TEXT NOT NULL,
          template_key TEXT NOT NULL REFERENCES quest_templates(key),
          attribute    TEXT ${attrOrNull('attribute')},
          target       INTEGER NOT NULL CHECK (target > 0),
          progress     INTEGER NOT NULL DEFAULT 0,
          status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${inList(QUEST_STATUSES)})),
          confirmed_at TEXT,
          completed_at TEXT,
          created_at   TEXT NOT NULL,
          UNIQUE (day, template_key)
        );

        CREATE TABLE IF NOT EXISTS penalties (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          kind        TEXT NOT NULL CHECK (kind IN ('penalty_quest')),
          source_day  TEXT NOT NULL,
          day         TEXT NOT NULL,
          target      INTEGER NOT NULL CHECK (target > 0),
          progress    INTEGER NOT NULL DEFAULT 0,
          status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${inList(PENALTY_STATUSES)})),
          created_at  TEXT NOT NULL,
          resolved_at TEXT,
          UNIQUE (kind, source_day)
        );

        CREATE TABLE IF NOT EXISTS rest_days (
          day        TEXT PRIMARY KEY,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS vacation_periods (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          start_day  TEXT NOT NULL,
          end_day    TEXT NOT NULL,
          reason     TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          CHECK (end_day >= start_day)
        );

        CREATE TABLE IF NOT EXISTS debuffs (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          kind       TEXT NOT NULL CHECK (kind IN (${inList(DEBUFF_KINDS)})),
          attribute  TEXT ${attrOrNull('attribute')},
          source     TEXT,
          started_at TEXT NOT NULL,
          expires_at TEXT,
          removed_at TEXT,
          CHECK ((kind = 'rusty') = (attribute IS NOT NULL))
        );

        CREATE TABLE IF NOT EXISTS trials (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          rank           TEXT NOT NULL UNIQUE CHECK (rank IN (${inList(RANKS.slice(1))})),
          status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
          opened_at      TEXT NOT NULL,
          suggested_date TEXT,
          completed_at   TEXT
        );

        CREATE TABLE IF NOT EXISTS game_config (
          key           TEXT PRIMARY KEY,
          value         REAL NOT NULL,
          default_value REAL NOT NULL,
          updated_at    TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS player_profile (
          id           INTEGER PRIMARY KEY CHECK (id = 1),
          name         TEXT NOT NULL DEFAULT '',
          title_slot_1 TEXT,
          title_slot_2 TEXT,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);

      const now = new Date().toISOString();
      const quest = db.prepare(
        `INSERT OR IGNORE INTO quest_templates (key, metric, attribute, in_daily_clear, sort_order)
         VALUES (@key, @metric, @attribute, @in_daily_clear, @sort_order)`,
      );
      for (const q of QUEST_TEMPLATES) quest.run(q);
      db.prepare('INSERT OR IGNORE INTO player_profile (id, created_at, updated_at) VALUES (1, ?, ?)').run(now, now);
    },
  },
];

/** GAME_DESIGN.md §5. attribute NULL = resolved per day (Body: by category; Bonus: most neglected). */
export const QUEST_TEMPLATES = [
  { key: 'tasks', metric: 'tasks_completed', attribute: 'DISC', in_daily_clear: 1, sort_order: 1 },
  { key: 'focus', metric: 'pomodoros_completed', attribute: 'WILL', in_daily_clear: 1, sort_order: 2 },
  { key: 'body', metric: 'physical_activity', attribute: null, in_daily_clear: 1, sort_order: 3 },
  { key: 'bonus', metric: 'neglected_attribute', attribute: null, in_daily_clear: 0, sort_order: 4 },
];

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

/**
 * Applies pending migrations. Before touching an existing database it writes a consistent snapshot
 * (VACUUM INTO, which includes WAL content) to backupDir. Returns what happened.
 */
export function runMigrations(db, { backupDir, isFresh, log = console.log }) {
  const from = db.pragma('user_version', { simple: true });
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (!pending.length) return { from, to: from, backup: null };

  let backup = null;
  if (!isFresh) {
    fs.mkdirSync(backupDir, { recursive: true });
    backup = path.join(backupDir, `atlas-before-v${pending[0].version}-${stamp()}.db`);
    db.prepare('VACUUM INTO ?').run(backup);
    log(`Backup written to ${backup}`);
  }
  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${Number(m.version)}`);
    })();
    log(`Migrated database to version ${m.version} (${m.name})`);
  }
  return { from, to: pending[pending.length - 1].version, backup };
}
