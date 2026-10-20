// Every number of the game (GAME_DESIGN.md) as a game_config row. The engine reads these rows; it
// never hard-codes a value. Medal thresholds and title buffs belong to badge_defs / titles (phase 4b).

/** [key, default value, design section]. Ratios are fractions (0.5 = 50 %). Days are game days. */
export const GAME_CONFIG_DEFAULTS = [
  // §3 XP sources
  ['xp.task.low', 10, '§3'],
  ['xp.task.medium', 20, '§3'],
  ['xp.task.high', 40, '§3'],
  ['xp.stages.share', 0.5, '§3 part of the task XP split across stages; the rest is paid on completion'],
  ['xp.pomodoro', 5, '§3 focus Pomodoro'],
  ['xp.pomodoro.daily_cap', 8, '§3 max Pomodoros paid per day'],
  ['xp.appointment.attended', 15, '§3'],
  // §2 attribute split
  ['xp.attribute.primary_share', 1, '§2 primary attribute receives 100 %'],
  ['xp.attribute.secondary_share', 0.5, '§2 secondary attribute receives 50 %'],
  ['xp.will.high_share', 0.25, '§2 WILL bonus on High-priority tasks'],
  // §3 modifiers
  ['xp.modifier.early_bonus', 0.1, '§3 +10 % when completed before the due date'],
  ['xp.modifier.late_multiplier', 0.5, '§3 late completion pays 50 %'],
  ['xp.modifier.antifarm_minutes', 5, '§3 created and completed within N minutes'],
  ['xp.modifier.antifarm_multiplier', 0.1, '§3 anti-farm pays 10 %'],
  ['xp.softcap.daily', 300, '§3 soft cap per day'],
  ['xp.softcap.multiplier', 0.5, '§3 Low/Medium tasks and Pomodoros above the cap'],
  // §4 levels and ranks
  ['level.curve.base', 330, '§4 XP from level L to L+1 = base * L^exponent'],
  ['level.curve.exponent', 0.5, '§4'],
  ['attribute.curve.base', 50, '§4 starting point, tuned by the simulation (phase 3)'],
  ['attribute.curve.exponent', 1, '§4 50 * L'],
  ['rank.E.min_level', 1, '§4'],
  ['rank.D.min_level', 10, '§4'],
  ['rank.C.min_level', 20, '§4'],
  ['rank.B.min_level', 35, '§4'],
  ['rank.A.min_level', 50, '§4'],
  ['rank.S.min_level', 70, '§4'],
  // §5 day and daily quests
  ['day.boundary_minutes', 180, '§5 a game day starts at 03:00 local time'],
  ['quest.tasks.weekday_target', 2, '§5 tasks completed'],
  ['quest.tasks.weekday_high_target', 1, '§5 …or High tasks completed'],
  ['quest.tasks.weekend_target', 1, '§5'],
  ['quest.tasks.reward_xp', 20, '§5 to DISC'],
  ['quest.focus.weekday_target', 3, '§5 Pomodoros'],
  ['quest.focus.weekend_target', 2, '§5'],
  ['quest.focus.reward_xp', 20, '§5 to WILL'],
  ['quest.body.weekday_target', 1, '§5 physical activities'],
  ['quest.body.weekend_target', 1, '§5'],
  ['quest.body.min_minutes', 30, '§5 walk or run of 30+ min'],
  ['quest.body.reward_xp', 20, '§5 to VIT, STR or AGI by category'],
  ['quest.bonus.target', 1, '§5 optional'],
  ['quest.bonus.reward_xp', 15, '§5 to the most neglected of FAITH, CHA, MIND, SENSE'],
  ['quest.daily_clear.reward_xp', 30, '§5 all fixed quests done'],
  ['quest.daily_clear.disc_xp', 30, '§5'],
  ['quest.daily_clear.streak_increment', 1, '§5'],
  // §6 penalties and debuffs
  ['penalty.quest.extra_pomodoros', 2, '§6 penalty quest the day after a failed day'],
  ['penalty.quest.reward_will_xp', 10, '§6'],
  ['debuff.fatigue.multiplier', 0.8, '§6 total XP x0.8'],
  ['debuff.fatigue.hours', 24, '§6'],
  ['debuff.rusty.inactive_days', 14, '§6 active days without XP in an attribute'],
  ['debuff.rusty.multiplier', 0.5, '§6 XP into that attribute'],
  ['debuff.rusty.removal_events', 3, '§6 separate events…'],
  ['debuff.rusty.removal_window_days', 7, '§6 …within a rolling window'],
  // §7 escape valves
  ['rest.guaranteed_per_week', 1, '§7'],
  ['rest.max_per_week', 2, '§7'],
  ['rest.mind_xp', 10, '§7 "small MIND XP" (value not in the design; see PHASE1_REPORT.md)'],
  ['shield.per_month', 1, '§7 streak shield'],
  ['shield.min_streak', 7, '§7 the shield only protects a streak of 7+'],
  // §8 rank-up trials (A and S: to be defined)
  ['trial.D.daily_clears', 7, '§8'],
  ['trial.D.high_tasks', 3, '§8'],
  ['trial.C.daily_clears', 14, '§8'],
  ['trial.C.high_tasks', 5, '§8'],
  ['trial.C.attributes_progressed', 3, '§8 progress in 3 different attributes'],
  ['trial.B.daily_clears', 21, '§8'],
  ['trial.B.high_tasks', 8, '§8'],
  ['trial.B.balance_min_attribute_level', 3, '§8 "balance across attributes" (placeholder; see PHASE1_REPORT.md)'],
  // §12.4 buff limits
  ['buff.attribute.gold', 0.1, '§12.4'],
  ['buff.attribute.platinum', 0.15, '§12.4'],
  ['buff.attribute.diamond', 0.2, '§12.4'],
  ['buff.attribute.mythic', 0.25, '§12.4'],
  ['buff.attribute.cap', 0.25, '§12.4 per attribute, also across two slots'],
  ['buff.total_xp.cap', 0.05, '§12.4 only if total-XP buffs are ever added'],
];

/**
 * Inserts missing keys and refreshes default_value; a value the user edited is kept.
 * Runs on every start, so keys added in later versions appear automatically.
 */
export function seedGameConfig(db) {
  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO game_config (key, value, default_value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET default_value = excluded.default_value`,
  );
  db.transaction(() => {
    for (const [key, value] of GAME_CONFIG_DEFAULTS) upsert.run(key, value, value, now);
  })();
}

/** All config values as { key: number }. */
export function readGameConfig(db) {
  return Object.fromEntries(db.prepare('SELECT key, value FROM game_config ORDER BY key').all().map((r) => [r.key, r.value]));
}
