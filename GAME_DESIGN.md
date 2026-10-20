# Atlas v2: Game System Design

Status: design closed on 2026-10-20 (owner: Benjamim Frade). Implementation happens on branch `v2-gamification`, in phases (section 14). `main` stays as the stable, QA-verified v1.

## 1. Principles

1. **Everything is an event.** XP, penalties, quests and trials are rows. Level, rank and attribute levels are always *computed* from events, never stored as loose numbers.
2. **XP is granted once.** Each XP event has a unique key (for example `task:42:complete`). Done, undo, Done again never pays twice. Undo marks the event `revoked`; redoing reactivates the same key.
3. **Never lose level or rank.** Failure costs streak, a temporary XP debuff, or an attribute "Rusty" debuff. Overall level, rank and attribute levels never go down.
4. **Rules live in config.** Every number in this document is a row in `game_config`, editable without code changes.
5. **Single player.** Rules protect against accidental exploits and self-deception, not against adversaries.
6. **Stable keys, translated labels.** Attributes, ranks, event types, quest types and debuffs are stored as stable English keys. All visible text lives in `src/locales/en.json` and `pt.json` (key parity is a test).

## 2. Attributes (10 maximum)

| Key | PT | Grows with |
|---|---|---|
| INT | Inteligencia | Technical and exact-science study (CIS, Physical Science) |
| SENSE | Percepcao | Reading, writing, psychology, rhetoric |
| STR | Forca | Strength training, gym |
| AGI | Agilidade | Muay Thai, cardio, mobility, running, walking |
| VIT | Vitalidade | Physical health: sleep, nutrition, medical appointments |
| MIND | Mente | Mental health: rest days, breaks, planned recovery |
| FAITH | Fe | Theology, Bible reading, prayer, ministry |
| CHA | Carisma | Communication, video, streaming, content |
| WILL | Vontade | Doing the hard thing: High-priority tasks, penalty quests, trials |
| DISC | Disciplina | Consistency: daily quests, streak |

Rules: streak feeds DISC, rest feeds MIND, VIT is physical health only.

Each **category** has one primary attribute (100% of the XP) and an optional secondary (50%), editable in settings. Starting suggestions (user must create the new categories):

| Category | Primary | Secondary |
|---|---|---|
| Intro CIS | INT | |
| Physical Science I | INT | SENSE |
| Comp and Rhetoric II | SENSE | CHA |
| psychology | SENSE | INT |
| Gym | STR | VIT |
| Muay Thai | AGI | STR |
| Theology / Bible | FAITH | SENSE |
| Silver Films / bFADE | CHA | SENSE |
| Health | VIT | |
| Rest / Mental health | MIND | |

WILL also receives 25% of the base XP of every High-priority task, on top of the category split.

## 3. XP

| Source | Base XP |
|---|---|
| Complete a task | Low 10, Medium 20, High 40 |
| Stage (checklist item) completed | 50% of the task XP split across stages; the other 50% on task completion |
| Task without stages | 100% on completion |
| Focus Pomodoro completed | 5 (max 8 per day) |
| Appointment marked "attended" | 15, to the category attribute |

Modifiers:
- Completed before the due date: +10%.
- Completed late: 50% of XP (never zero).
- Created and completed within 5 minutes: 10% of XP (anti-farm).
- **Soft cap:** after 300 XP in a day, further XP from Low/Medium tasks and Pomodoros is halved. High-priority tasks, trials and quest rewards ignore the cap and do not count toward it.

Every XP grant adds to total XP (level/rank) once, and the attribute portion adds to the category's attributes.

## 4. Levels and ranks

Overall level: XP needed to go from level L to L+1 is `330 * L^0.5`, rounded. Reference at 200 XP/day: level 10 in ~32 days, level 25 in ~133 days, level 50 in ~384 days. Levels 1 to 5 take 1 to 4 days each, levels 40 to 50 take 10 to 12 days each. (The first draft `100 * L^1.2` was rejected: level 50 would take over 3 years.)

Attribute level curve: starting point `50 * L`, to be tuned by the simulation script. Target: a level-up in some attribute almost every day early on.

A simulation script (`scripts/simulate-xp.*`) must print days to levels 10, 25 and 50 for 100, 150 and 200 XP/day, and the attribute pace. Curves are tuned from its output; real usage will average below 200.

| Rank | Levels |
|---|---|
| E | 1 to 9 |
| D | 10 to 19 |
| C | 20 to 34 |
| B | 35 to 49 |
| A | 50 to 69 |
| S | 70+ |

Reaching the level opens a **Rank-up Trial**; the rank changes only when the trial is completed (section 8).

## 5. Daily quests

Day boundary: **03:00** local time (configurable). Quests are generated on the first app open of the day; missed days are evaluated on the next open (catch-up). Progress is counted automatically from existing events; quests with no in-app event (for example Bible reading) have a confirm button.

| Quest | Weekdays | Weekend | Attribute | Reward |
|---|---|---|---|---|
| Tasks | 2 tasks, or 1 High | 1 task | DISC | 20 XP |
| Focus | 3 Pomodoros | 2 Pomodoros | WILL | 20 XP |
| Body | 1 physical activity (gym, Muay Thai, walk or run of 30+ min) | same | VIT, STR or AGI by category | 20 XP |
| Bonus (optional) | Most neglected of FAITH, CHA, MIND, SENSE | same | that attribute | 15 XP |

**Daily Clear** = the 3 fixed quests: +30 XP, +30 DISC, streak +1. The bonus quest is outside the Daily Clear. Quest XP does not count toward the soft cap. Quest templates and targets are rows in `quest_templates`.

## 6. Penalties and debuffs

| Failure | Consequence |
|---|---|
| Fixed quests not completed | Streak resets to 0 |
| Failed day | Next day a **penalty quest** appears: 2 extra Pomodoros |
| Penalty quest completed | +10 WILL XP, no debuff |
| Penalty quest failed | **Fatigue**: total XP x0.8 for 24 h |
| Attribute with no XP for 14 active days | **Rusty** debuff on that attribute (below) |
| Overdue open task | Red styling only; XP is reduced only when completed (50%) |

**Rusty (per attribute):** while active, XP going into that attribute is x0.5 (total XP and other attributes are unaffected). It is removed when that attribute receives XP from 3 or more separate events within a rolling 7-day window. Attributes never lose XP or levels. Rest days and vacation mode do not count toward the 14 days. A rest day counts as use of MIND.

## 7. Escape valves

- **Rest day:** at least 1 per week is guaranteed; the user may mark 1 extra (max 2 per week). A rest day can be marked up to the day boundary. No penalty, streak preserved, small MIND XP. XP earned on a rest day still counts.
- **Vacation/sick mode:** pauses quests for a date range; paused days are not failures.
- **Streak shield:** 1 per calendar month, automatic. When a day fails and the streak is 7 or more, the shield absorbs it and the streak is kept.

## 8. Rank-up Trials

| Rank | Trial (starting values, in `game_config`) |
|---|---|
| D | 7 Daily Clear days (not necessarily consecutive) + 3 High tasks |
| C | 14 Daily Clear days + 5 High tasks + progress in 3 different attributes |
| B | 21 Daily Clear days + 8 High tasks + balance across attributes |
| A, S | To be defined when reached |

A trial has a suggested date but no failure state: not finishing it only holds the promotion.

## 9. Appointments and stages

- **Stages:** ordered checklist inside a task, with a progress bar (done/total). Reorderable, editable inline.
- **Appointments:** separate from tasks. Fields: title, category, start, end, location, notes, status (`planned`, `attended`, `missed`). Shown in the calendar with time (week/day views); tasks remain due-date markers.

## 10. Data model (SQLite, raw parameterized SQL, no ORM)

`task_stages`, `appointments`, `xp_events` (id, type, ref, **unique key**, total_xp, attribute, attribute_xp, status active/revoked, day, created_at), `category_attributes`, `quest_templates`, `daily_quests`, `penalties`, `rest_days`, `vacation_periods`, `debuffs`, `streak_state` (or derived), `trials`, `badge_defs`, `badge_unlocks` (UNIQUE badge_key + tier), `titles` (title_key, source medal and tier, equipped slot), `game_config`, `player_profile` (name, equipped titles). Derived values (levels, ranks, rusty status) are computed from events.

## 11. Avatar and status screen

The user creates the avatar: PNG, transparent background, 512x512, **one per rank (E, D, C, B, A, S) plus a default**. Status screen: avatar, name, title, level, rank, XP bar, 10 attributes with bars and Rusty indicators, streak, today's quests, active debuffs. It also shows the equipped title with its buff, and links to the medal collection (section 12).

## 12. Medals, titles and buffs

40 medals at launch. All are computed from existing events; none is marked by hand. Rules:
- **Permanent:** an unlocked medal is never revoked, even if the streak or count drops later.
- **Idempotent:** unique `(badge_key, tier)`.
- **Retroactive:** when a medal is added or edited, the engine evaluates the whole history and grants every tier already reached.
- **No XP.** The curve is calibrated on XP, so medals pay in titles, buffs, a tier frame on the avatar and the collection screen.
- **Tiers:** bronze, silver, gold, platinum, diamond, and mythic (only on a few medals). Thresholds are data (`badge_defs`), not code.
- An unlock shows a toast. Secret medals show as "???" in the collection until unlocked.

### 12.1 General progressive medals (17)

Thresholds are starting values for bronze / silver / gold / platinum / diamond (mythic where listed).

| # | Key (PT) | Metric | Thresholds |
|---|---|---|---|
| 1 | STREAK (Sequencia) | Streak days | 7 / 30 / 100 / 200 / 365, mythic 500 |
| 2 | DAILY_CLEAR (Dia Perfeito) | Daily Clears | 7 / 30 / 100 / 200 / 365 |
| 3 | TASKS (Tarefas) | Tasks completed | 10 / 50 / 200 / 500 / 1000, mythic 2500 |
| 4 | HIGH_PRIORITY (Alta Prioridade) | High tasks completed | 5 / 20 / 60 / 150 / 300 |
| 5 | PUNCTUAL (Pontual) | Tasks completed before due date | 10 / 40 / 120 / 300 / 600 |
| 6 | FINISHER (Finalizador) | Tasks completed with all stages done | 5 / 25 / 80 / 200 / 400 |
| 7 | STAGE_MASTER (Mestre das Etapas) | Stages completed | 25 / 100 / 300 / 700 / 1500 |
| 8 | FOCUS (Foco) | Pomodoros completed | 25 / 100 / 300 / 700 / 1500, mythic 3000 |
| 9 | LEVEL (Nivel) | Overall level | 5 / 10 / 25 / 50 / 70, mythic 100 |
| 10 | HUNTER_RANK (Rank de Cacador) | Rank-up Trials completed | D / C / B / A / S |
| 11 | SPECIALIST (Especialista) | Highest attribute level | 5 / 10 / 20 / 30 / 40, mythic 50 |
| 12 | BALANCED (Equilibrado) | Level reached in all 10 attributes | 3 / 5 / 10 / 15 / 20 |
| 13 | COMEBACK (Retorno) | Penalty quests completed | 1 / 5 / 15 / 30 / 60 |
| 14 | RUST_BREAKER (Quebra-Ferrugem) | Rusty debuffs removed | 1 / 5 / 15 / 30 / 60 |
| 15 | ATTENDANCE (Presenca) | Appointments attended | 5 / 25 / 75 / 150 / 300 |
| 16 | REST_WISELY (Descanso Sabio) | Rest days used | 4 / 12 / 26 / 52 / 104 |
| 17 | BONUS_HUNTER (Cacador de Bonus) | Bonus quests completed | 5 / 25 / 75 / 150 / 300 |

### 12.2 Custom medals (9)

Tied to the user's life and categories. Each is a `badge_defs` row that references a category **by id**, so renaming or deleting a category never breaks it. Starting set (suggested categories must exist):

| # | Key (PT) | Metric | Thresholds |
|---|---|---|---|
| 18 | DIRECTOR (Diretor) | Tasks completed in Silver Films | 5 / 25 / 75 / 150 / 300 |
| 19 | BROADCASTER (Streamer) | bFADE appointments attended (streams) | 5 / 20 / 50 / 100 / 200 |
| 20 | THEOLOGIAN (Teologo) | Distinct days with FAITH XP | 7 / 30 / 100 / 200 / 365 |
| 21 | FIGHTER (Lutador) | Muay Thai sessions | 10 / 30 / 80 / 150 / 300 |
| 22 | IRON_BODY (Corpo de Ferro) | Gym sessions | 10 / 30 / 80 / 150 / 300 |
| 23 | ROAD_WARRIOR (Guerreiro da Estrada) | Walks or runs of 30+ min | 10 / 30 / 80 / 150 / 300 |
| 24 | SCHOLAR (Estudioso) | Tasks completed in academic categories | 10 / 50 / 150 / 300 / 500 |
| 25 | EXAM_SLAYER (Mata-Provas) | High tasks in academic categories | 3 / 10 / 25 / 50 / 100 |
| 26 | BOOKWORM (Leitor) | Distinct days with SENSE XP | 7 / 30 / 100 / 200 / 365 |

**Medal builder** (settings): the user creates a custom medal by choosing a metric (tasks completed, sessions attended, Pomodoros, active days), a category, five thresholds, a title name and a buff.

### 12.3 Secret medals (14)

Single tier (gold, except FIRST_BLOOD bronze). Hidden as "???" until unlocked.

| # | Key | Condition |
|---|---|---|
| 27 | NIGHT_OWL | Complete a task between 00:00 and 03:00 |
| 28 | EARLY_BIRD | Complete a task before 06:00 |
| 29 | PERFECT_WEEK | Daily Clear on all 7 days of a week |
| 30 | PHOENIX | After losing a streak of 14+, rebuild a 14-day streak |
| 31 | BUZZER_BEATER | Complete a High task in the last hour before its due time |
| 32 | CLEAN_SLATE | No overdue open tasks for 30 consecutive days |
| 33 | MARATHON | 10 tasks completed in one day |
| 34 | ZEN_MASTER | Use 2 rest days in a month and end it with a streak of 20+ |
| 35 | TRIPLE_THREAT | Gym, Muay Thai and a walk/run on the same day |
| 36 | OVERDRIVE | Reach the 300 XP soft cap in a day |
| 37 | DEEP_WORK | 8 Pomodoros in one day |
| 38 | JACK_OF_ALL_TRADES | XP in all 10 attributes within one week |
| 39 | FIRST_BLOOD | Complete your first task |
| 40 | REDEMPTION | Complete a High task that was overdue by 7+ days |

### 12.4 Titles and buffs

Every medal unlocks a title (general and custom medals at gold, secret medals on unlock). Higher tiers upgrade that title's buff. One title is equipped at a time; a second slot unlocks at rank C. The equipped title appears next to the player name.

Buff rules, to protect the calibrated curve:
- **Buffs never multiply total XP.** Level and rank pace stay as simulated.
- **Attribute buffs:** +X% XP to one attribute: gold +10%, platinum +15%, diamond +20%, mythic +25%. Hard cap +25% per attribute, also across two slots.
- **Utility buffs:** small rule changes, for example Pomodoro daily cap 8 to 10, soft cap 300 to 350, Rusty threshold 14 to 18 days, Fatigue 24 h to 12 h, +1 streak shield per month, early-completion bonus +10% to +15%.
- Secret medals grant utility buffs only.
- A buff never removes a penalty completely.
- If the user later wants total-XP buffs, cap them at +5% overall and re-run the simulation.

Starting titles:

| Title | Medal | Buff |
|---|---|---|
| The Consistent | STREAK | DISC XP +10% |
| Unbroken | STREAK (diamond) | Fatigue lasts 12 h |
| Deep Diver | FOCUS | Pomodoro daily cap 8 to 10 |
| Closer | PUNCTUAL | Early-completion bonus +15% |
| Iron Will | HIGH_PRIORITY | WILL XP +10% |
| Theologian | THEOLOGIAN | FAITH XP +10% |
| Fighter | FIGHTER | AGI XP +10% |
| Iron Body | IRON_BODY | STR XP +10% |
| Director | DIRECTOR | CHA XP +10% |
| Scholar | SCHOLAR | INT XP +10% |
| Well Rested | REST_WISELY | MIND XP +10% |
| Phoenix | PHOENIX | +1 streak shield per month |
| Night Owl | NIGHT_OWL | Rusty threshold 14 to 18 days |

The simulation script must run with and without maximum buffs and report both.

## 13. Acceptance tests (automated, in the game engine)

XP idempotency (Done, undo, Done again); revoke and reactivate; soft cap boundaries (task straddling 300); High and trial exempt from cap; late 50%; early +10%; 5-minute anti-farm; stage split sums to 100%; day boundary at 03:00 including DST days; catch-up after several closed days; weekend quest targets; rest-day limits (max 2 per week); streak shield (once per month, only at streak 7+); Fatigue expiry at 24 h; Rusty apply and removal (3 events in rolling 7 days); levels and ranks never decrease; i18n key parity between `en.json` and `pt.json`; API rejects invalid types and dates; medal unlock idempotency per (badge, tier); retroactive evaluation grants every tier already reached; secret medals hidden until unlocked; unlocks never revoked; one equipped title (two slots from rank C); buffs never multiply total XP and respect the +25% attribute cap; custom medals survive category rename and delete.

## 14. Build phases

1. Data model: stages, appointments, game tables, `game_config` seed, safe migration of `data/atlas.db`.
2. Calendar with appointments (week and day views).
3. XP, level, rank and attribute engine, with the simulation script and automated tests.
4. Quests, penalties, debuffs, rest days, vacation, shield, rank-up trials.
4b. Medals, titles and buffs: definitions, retroactive evaluation, equipped titles, custom medal builder.
5. Visual layer: status screen, medal collection and icons, logo, icons, aesthetic, animations (tone and intensity to be decided).
6. Full QA round (QA_REPORT_V2.md) and fixes round, as in v1.

## 15. Open items

- Visual tone: discreet or strongly animated (level-up effects). Decide before phase 5.
- Logo, icons, aesthetic: phase 5.
- Trials for ranks A and S.
- Player name and starting title.
- Medal icons per tier and unlock animation style (phase 5).
- Final list of custom medals after the categories exist.
