# Atlas: QA / Beta-Test Report

**Date:** 10/16/2026 · **Build tested:** Atlas v1 + "Atlas" update (as in `versionone.md`) · **Tester mode:** test-and-report only (no source changes)

**How it was tested**
- The project was copied to a scratch folder and run there against a **fresh, empty database** (first-run path). The real `data/tasks.db` was only opened read-only, so none of your tasks were touched.
- API: `node server/index.js` (port 3001). UI: Vite 5.4.11 (port 5173).
- Browser tests used Playwright driving the installed Google Chrome (headless), with timezone `America/Chicago`. Pomodoro timing used Playwright's fake clock, except the two-tab test, which ran in real time.
- API abuse used `curl`. Date logic was run directly from `src/lib/dates.ts` with `TZ=America/Chicago`. Dependencies were checked with `npm audit`, and `tsc --noEmit` passes.

---

## 1. Executive Summary

**Verdict: NEEDS REVISION**

The core of Atlas works. Tasks can be created and edited, and they persist across reloads and server restarts. Status and Priority are stored as language-independent keys (`todo`, `high`, …). PT/EN switching is instant, complete (166/166 keys in both locales), persisted, and formats dates and week starts correctly. All SQL is parameterized; SQL-injection and XSS payloads are stored and shown as plain text. The API listens on 127.0.0.1 only, and the page makes **zero outbound network requests**. The Pomodoro auto-cycle (4 pomodoros, then a long break) works and saves sessions.

Release is blocked by four High issues:
- Dropping a card in the empty part of a Board column sends it to the **wrong column**.
- A failed save **closes the edit modal and throws away what the user typed**.
- "Restore sample data" **silently deletes sample tasks the user has edited**.
- The Vite dev server (the way the README tells you to run the app) **serves the SQLite database and arbitrary files** and has known high-severity CVEs.

The reported column-order issue is real, but it is a saved user setting, not a wrong default (see M1).

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 4 |
| Medium | 10 |
| Low | 13 |

---

## 2. Issues / Bugs Found

### HIGH

#### H1: Board: dropping a card below a column's last card puts it in the wrong column (or doesn't move it)
- **View:** Board, drag and drop
- **Steps:**
  1. Open the Board with sample data. To-do has many cards; Backlog, In Progress and Blocked have one or two.
  2. Drag "Essay draft" (In Progress) and drop it in the **empty area** of the Backlog column, below the last card (pointer at y≈650 px, no scrolling).
- **Expected:** Status becomes Backlog.
- **Actual:** Status became **To-do**, a third column. The drag preview placeholder showed up in To-do while the pointer was over Backlog. Other runs: "Peer review" dropped in Blocked's empty area stayed **Done**, and "Midterm study guide" dropped in In Progress's empty area stayed **Blocked**. Dropping near the top of a column (over its cards) works.
- **Why it matters:** The status changes silently to something the user didn't choose. Columns stretch to the tallest column's height (2,232 px in the test), so most of each column is "empty area", which is exactly where people drop.
- **Location:** `src/views/BoardView.tsx:42-46`. The custom collision detector uses `closestCorners` against all cards and column lists. Corners of cards in a neighbouring column end up closer than the target column's own (very tall) list.

#### H2: A failed save closes the task modal and discards the user's edits
- **View:** Task modal (create/edit)
- **Steps:**
  1. Open "Midterm study guide" and type ~11,000 characters of notes.
  2. Stop the API (simulates a crash, a laptop sleep/wake glitch, or a closed terminal).
  3. Click **Save**.
- **Expected:** The modal stays open with the text intact, and an error explains that the save failed.
- **Actual:** The modal **closes**, the toast says "Something went wrong. Please try again.", and the optimistic update is rolled back. After restarting the server, the notes are still the old 53 characters. **The 11k characters are gone**, and there is nothing left to "try again" with.
- **Location:** `src/components/TaskModal.tsx:68-70` calls `closeTask()` unconditionally after `updateTask`. `src/store.tsx:109-119`: `updateTask` swallows the error and returns nothing, so the caller can't tell it failed. (Create is handled correctly: `createTask` returns `null`, so the modal stays open.)

#### H3: Dev server exposes the database and arbitrary local files; vulnerable Vite version
- **View:** Infrastructure (`npm run dev`, the documented way to run Atlas)
- **Evidence (all reproduced with curl against the running dev server):**
  - `GET http://localhost:5173/data/tasks.db` → **200**, a valid SQLite file.
  - `GET http://localhost:5173/data/tasks.db-wal` → **200**, 4.1 MB containing every task name, note and date in plain text.
  - `GET http://localhost:5173/@fs/etc/passwd?import&raw??` → **200**, returned the contents of `/etc/passwd` (CVE-2025-30208, `server.fs.deny` bypass, fixed in Vite ≥ 5.4.15).
  - `Host: attacker.example` is accepted by both Vite (200) and Express (200). Vite 5.4.11 has no `allowedHosts` check (CVE-2025-24010, DNS rebinding: "websites were able to send any requests to the development server and read the response").
- **Impact:** Both servers bind to localhost only, so nothing is reachable from the LAN. But while `npm run dev` is running, a malicious web page opened in the same browser could, through DNS rebinding, read the student's whole task database or other local files. That breaks the "100% local, no data leaves the machine" promise.
- **Location:** `vite.config.ts` (root = project root, so `data/` is served), `package.json` (`vite 5.4.11`). See also M10 for the rest of `npm audit`.

#### H4: "Restore sample data" silently deletes sample tasks the user has edited (no confirmation)
- **View:** Settings → Sample data
- **Steps:**
  1. Edit a sample task (e.g., rename "Midterm study guide" to "MY REAL midterm plan" and add notes). Optionally log a Pomodoro against it.
  2. Click **Restore sample data** (or `POST /api/sample`).
- **Expected:** Either only untouched samples are replaced, or the user is warned first.
- **Actual:** The edited task is **deleted** (0 rows remain) and its Pomodoro session loses its task link (`task_id` → NULL). The Restore button has **no confirmation dialog** (Remove has one). A student who "adopted" a sample task as a real assignment loses it.
- **Location:** `server/index.js:278-281` (`removeSampleTasks()` before insert); `server/db.js:107-109` (deletes by `is_sample = 1`, and edits never clear that flag); `src/components/SettingsModal.tsx:47` (no `confirm`).
- *Note:* your real DB's two tasks have `is_sample = 0`, so they are not at risk.

### MEDIUM

#### M1: Board column order shows To-do, In Progress, Done, Backlog, Blocked (reported issue, verified)
- **Cause (verified):** It's not a wrong default. A fresh database shows the correct order (Backlog → To-do → In Progress → Blocked → Done). Your real DB contains a saved setting: `boardColumns = ["todo","in_progress","done","backlog","blocked"]`.
- **How it happens:** The **entire column header** is a drag handle with a 5 px activation distance. In testing, one header drag of Backlog onto Done permanently reordered the board and saved it immediately. There is no undo and no visual "you moved a column" feedback; the only reset is buried in ⚙️ → "Reset column order".
- **Expected vs. actual:** The spec lists a fixed order. The app allows reordering (a requested feature), but it's far too easy to do by accident.
- **Location:** `src/views/BoardView.tsx:177` (header gets `sortable.listeners`), `:212-217`; persisted via `server/index.js:227-233`.
- **Immediate workaround:** ⚙️ → Reset column order.

#### M2: API accepts impossible dates/times; the UI then shows garbage and flags them overdue
- **Steps:** `POST /api/tasks` with `{"name":"x","dueDate":"2026-13-45","dueTime":"99:99"}` → **201**. `"2026-02-30"` → **201**. `{"dueTime":"10:00"}` without a dueDate → **201** (time stored with no date).
- **Actual in UI:** The card shows "13/45/2026 4:39 AM". "02/30/2026" is marked ⚠️ overdue and sorts **first** in All Active Tasks. The task never appears in the Calendar.
- **Expected:** 400 `invalid_date` / `invalid_time`. Any time without a date should be dropped.
- **Location:** `server/index.js:20-21` (format-only regex), `:87-95`. (The UI date parser `parseLocalDate` itself validates correctly; e.g., 02/29/2027 is rejected and 02/29/2028 accepted.)

#### M3: Overdue logic is off by one hour on daylight-saving days
- **Evidence (actual `src/lib/dates.ts`, `TZ=America/Chicago`):**
  - Due **11/01/2026 11:59 PM** (fall back): shows **overdue at 11:00 PM and 11:30 PM**, about an hour early.
  - Due **03/08/2026 11:59 PM** (spring forward): **not** overdue at 12:30 AM on 03/09, about an hour late.
- **Location:** `src/lib/dates.ts:59` adds `hours*60*60*1000` ms to local midnight, which assumes every day is 24 h. All other date checks passed: Feb 29, Dec 31 → Jan 1, year 2100, 12:00 AM and 11:59 PM, and no UTC off-by-one for date-only due dates.

#### M4: Pomodoro: two tabs run independent timers and record duplicate sessions
- **Steps:** Start a 1-minute Custom timer in tab 1. Open tab 2 (it loads the same running timer from localStorage). Press Reset in tab 2, then Start. Wait 62 s.
- **Actual:** Reset in tab 2 **did not affect tab 1** (tab 1 title still "00:58 · Custom"). Both tabs completed, and **2 sessions** were saved for one logical pomodoro, inflating "focus minutes". Two chimes and two notifications fire.
- **Location:** `src/pomodoro/PomodoroProvider.tsx:55-71` (state saved to localStorage, but no `storage` event listener or tab coordination); `:110-139` (each tab records on completion).

#### M5: Calendar has no overflow handling ("+N more")
- **Steps:** Put 8+ tasks on one day (tested with 16).
- **Actual:** The whole week row grows to 417 px (585 px with 1,000 tasks; page height 1,883 px). Every task is listed in full, pushing later weeks below the fold. That also makes drag targets in later weeks unreachable without scrolling.
- **Location:** `src/views/CalendarView.tsx:196-200`.

#### M6: Sluggish with hundreds of tasks (500–1,500 tested)
Measured in headless Chrome with ~657 tasks (Board renders every card):

| Action | Measured |
|---|---|
| `GET /api/tasks` (220 KB) | 10 ms |
| Board first render | 515 ms |
| Search, keystroke → paint | 355 / 236 / 163 / 136 / 115 ms (target < 50 ms) |
| Board drag (30 pointer moves) | 11 long tasks > 50 ms, worst **347 ms**, 1.7 s blocked in total |
| Switch to All Active (531 rows) | 626 ms |
| Switch to Default view (657 rows) | 805 ms |
| Click a table sort header | 868 ms |

- **Cause:** No search debounce/`useDeferredValue`; every card and row rendered (no virtualization); `Card` and table rows are not memoized; `categoryMap` is rebuilt on every data change (`src/store.tsx:91`), which re-renders every consumer. A realistic semester (100–300 tasks) will feel fine, but drag and search degrade noticeably past ~500.

#### M7: If the API isn't running, the app shows an empty board that looks like data loss
- **Steps:** Stop the API and reload the page.
- **Actual:** Five empty columns ("0" everywhere) and two generic "Something went wrong" toasts that disappear after 4 s. A non-expert user will think their tasks were deleted. The friendly `errors.network` message is never shown, because the Vite proxy answers with a 500 instead of a network failure.
- **Location:** `src/store.tsx:67-79` (`loading` becomes false even on error, so empty arrays render); `src/lib/api.ts:20-25`.

#### M8: Pomodoro session API has no bounds; the UI then shows absurd totals
- **Steps:** `POST /api/sessions {"mode":"pomodoro","durationSec":1e15,"localDate":"2026-10-16"}` → **201**. `"localDate":"2026-99-99"` → **201**.
- **Actual:** The Pomodoro panel showed "**16666666666667** minutes of focus" (screenshot in testing).
- **Location:** `server/index.js:250-259` (only `> 0` is checked; date is regex-only).

#### M9: `PATCH /api/categories/:id` with an empty body never responds (request hangs)
- **Steps:** `curl -X PATCH localhost:3001/api/categories/9999 -H 'Content-Type: application/json' -d '{}'`
- **Actual:** No response; it timed out after 5 s (HTTP 000). With an existing id it returns 200. With a missing id, `.get(id)` returns `undefined`, and `wrap()` only calls `res.json` when the result is not `undefined`, so the response is never sent.
- **Location:** `server/index.js:192-202` together with `:32-39`.

#### M10: `npm audit`: 14 vulnerable packages (9 high, 5 moderate)
Besides Vite (H3): `express` ≤ 4.22.2 via `path-to-regexp` (ReDoS), `qs` (DoS), `body-parser` (DoS); `esbuild` ≤ 0.24.2 (dev server readable by any website); `postcss` ≤ 8.5.22 (file read via sourceMappingURL); `tailwindcss` 3.4.17 → `postcss-selector-parser`, `micromatch`/`braces`/`fast-glob`/`chokidar`. Most runtime risk is low because the API is localhost-only, but the dev-server ones compound H3.

### LOW

| ID | Area | Issue (observed) | Location |
|---|---|---|---|
| L1 | API | Bodies > 100 KB (e.g., very long notes with accents or emoji) return **500 `server_error`** instead of **413**. The user sees a generic error with no hint that the note is too long. There is also no length limit on names: a 100,000-character name was accepted. `X-Powered-By: Express` is sent. | `server/index.js:17`, `:290-295` |
| L2 | Board | A long name with no spaces overflows its card: scrollWidth 1,036,338 px vs. 243 px card width, so the text spills over neighbouring columns. | `src/views/BoardView.tsx:259` (no `break-words`) |
| L3 | Board / Calendar | Filters with zero results: tables say "No tasks match.", but the Board shows five empty columns and the Calendar shows an empty month with **no empty-state message**. | `BoardView.tsx`, `CalendarView.tsx` |
| L4 | Pomodoro | Custom minutes "1.5" silently becomes **2**. After a reload, a custom value (e.g., 3) **reverts** to the Settings default (1), because an effect overwrites the restored state. (0, -5, 9999 and "abc" are correctly rejected.) | `PomodoroPanel.tsx:94-98`, `PomodoroProvider.tsx:79-89` |
| L5 | API | Wrong types are coerced, not rejected: `notes: {"a":1}` is saved as the text `"[object Object]"`. `categoryIds: [9999,-1,"1"]` silently drops unknown ids. | `server/index.js:96`, `:104-109` |
| L6 | Sample data | Rename the sample category "Intro CIS" to "CIS 101", then Restore sample data, and a **duplicate** "Intro CIS" category is created. | `server/db.js:86-91` |
| L7 | i18n | The time field is a native `<input type="time">`, which follows the OS locale, not the app language: in PT mode it showed a 12-hour `--:-- --` placeholder while the rest of the app uses 24 h. | `TaskModal.tsx:163-171` |
| L8 | Dev proxy | The Vite proxy targets `http://localhost:3001`, but the API binds only to `127.0.0.1`, so Node tries `::1` first. In a 500-request burst through the proxy, 110 failed (28 × 500, 82 × ETIMEDOUT). The same burst direct to the API: 500/500 OK. Single requests are fine (~3 ms). | `vite.config.ts:9` |
| L9 | i18n / UI | "To-do"/"A fazer" is the only status without an emoji, which looks inconsistent. "📥 Backlog" is untranslated in PT (acceptable loanword, but worth a decision). | `src/locales/*.json` (`status.todo`) |
| L10 | Spec | The database file is `data/tasks.db`; the spec says `data/atlas.db`. | `server/db.js:10` |
| L11 | Task modal | A click on the dark backdrop or pressing Esc closes the modal **without asking about unsaved changes**, so typed notes are lost. | `src/components/Modal.tsx:40`, `:28` |
| L12 | Calendar / overdue | "Today" and overdue highlighting are computed only at render. If the app is left open overnight, they stay stale until something re-renders. (Code inspection; not time-travel tested.) | `CalendarView.tsx:41`, `dates.ts:57` |
| L13 | Pomodoro | **Skip** always goes Pomodoro → Short Break, even after the 4th pomodoro of a cycle, and never auto-starts the next phase even when auto-cycle is on. | `PomodoroProvider.tsx:212-216` |

---

## 3. Edge-Case Stress Test Results

| # | Test case | Result | Notes |
|---|---|---|---|
| 1 | Create task with all fields (name, In Progress, High, 10/20/2026 11:59 PM, 2 categories, notes with ã ç é 🍅 שלום) | **Pass** | Stored exactly; shown on Board, Calendar (10/20 with "11:59 PM"), All Active and Default view |
| 2 | Board drag to a column, dropping near the top | **Pass** | Status updated and persisted |
| 3 | Board drag to a column, dropping in the empty lower area | **Fail** | H1 |
| 4 | Reorder within a column, then reload | **Pass** | Order persisted after reload |
| 5 | Mark Done: leaves All Active, stays in Default | **Pass** | Checked in code and UI (status filter `!== 'done'`) |
| 6 | Calendar drag to another day | **Pass** | 10/17 → 10/27; time preserved (Lab report kept 17:00); All Active reflects it |
| 7 | Click empty Calendar day → new task with that date | **Pass** | Prefilled 10/29/2026 |
| 8 | Sorting: All Active by due date asc, nulls last | **Pass** | Undated rows at the bottom (but invalid API dates sort first, see M2) |
| 9 | Sorting: Default by name desc; clickable headers | **Pass** | "Research…", "Read…", "Quiz…", …; `aria-sort` updates |
| 10 | Overdue highlighting (due before today, not Done) | **Pass** | Quiz 10/16 9:00 AM shown red after 9 AM; Done tasks never red |
| 11 | Overdue on DST days | **Fail** | M3 |
| 12 | Empty name / whitespace-only name | **Pass** | "Task Name is required." in UI; API returns 400 `name_required` |
| 13 | 500+ / 100,000-character name | **Fail** | Accepted with no limit; card overflow (L2) |
| 14 | 10,000+ character notes | **Pass** | 11,215 characters saved and reloaded |
| 15 | Notes > 100 KB | **Fail** | 500 instead of 413 / clear message (L1) |
| 16 | Emoji, accents, RTL text in name and notes | **Pass** | Round-trips intact |
| 17 | Task with no due date | **Pass** | Calendar shows "N tasks without a due date"; sorted last |
| 18 | Feb 29, Dec 31 → Jan 1, year 2100, 12:00 AM / 11:59 PM | **Pass** | Correct parse, format and calendar placement; no UTC off-by-one |
| 19 | Invalid dates via API (02/30, 13/45, 99:99) | **Fail** | M2 |
| 20 | 500–1,500 tasks: render, search, filter, drag | **Partial** | Works, but laggy (M6) |
| 21 | Many tasks on the same day | **Fail** | No "+N more" (M5) |
| 22 | Filters: Category + Priority + Status + search; clear | **Pass** | Logic is a correct AND of ORs (`FilterBar.tsx:15-24`); "Clear filters" resets |
| 23 | Filters with zero results | **Partial** | Tables OK; Board and Calendar have no empty state (L3) |
| 24 | Delete a category used by tasks | **Pass** | Links removed (3 → 0), no orphans (`foreign_key_check` clean), UI updated |
| 25 | Delete a task linked to a Pomodoro | **Pass** | Link dropped; sessions kept with `task_id = NULL`, shown as "No task" |
| 26 | Pomodoro start / pause / resume / reset / skip | **Pass** | Paused clock frozen for 20 s; title shows "⏸ 00:30 · Pomodoro — Atlas" |
| 27 | Pomodoro auto-cycle (4 pomodoros → long break) | **Pass** | P(1/4) → S → P(2/4) → S → P(3/4) → Long(4/4); 4 sessions saved with the linked task |
| 28 | Click Start 15× quickly | **Pass** | Single timer, no double start |
| 29 | Refresh mid-timer | **Pass** | Restored as running in the same mode (time is computed from `endAt`) |
| 30 | Two tabs at once | **Fail** | M4: duplicate sessions |
| 31 | Custom timer 0 / −5 / 1.5 / 9999 / "abc" | **Partial** | Invalid values rejected; 1.5 rounded to 2; value lost on reload (L4) |
| 32 | Background tab / minimized for the full duration | **Not fully verifiable** | Headless Chrome doesn't apply real background throttling. The design is sound: end time stored, one-shot timeout plus `visibilitychange` re-check |
| 33 | Denied notification permission | **Pass (code)** | Notification only sent when `permission === 'granted'`; no crash. No in-app hint that notifications are blocked |
| 34 | PT/EN switch on every view and the Pomodoro panel | **Pass** | 166/166 keys in both locales; no leftover English found (apart from "Status"/"Backlog", which are valid PT) |
| 35 | Date formats and week start | **Pass** | EN: MM/DD/YYYY, Sun–Sat, "10/11/2026 – 10/17/2026". PT: DD/MM/YYYY, seg–dom, "12/10/2026 – 18/10/2026", "Outubro de 2026" |
| 36 | Language persisted after reload | **Pass** | `<html lang="pt-BR">` after reload |
| 37 | 30 rapid language switches | **Pass** | Data unchanged; DB holds only keys (`todo`, `in_progress`, `high`, …) |
| 38 | Dark / light theme | **Pass** | Toggle works; persisted; no flash on load |
| 39 | Mobile width (375 px) | **Pass** | 0 px horizontal page overflow on all four views; modal usable |
| 40 | Double-submit (3× Cmd+Enter, 2× Enter) | **Pass** | One task created each time (not stress-tested against a slow server) |
| 41 | Server killed mid-use, restarted | **Partial** | DB `integrity_check = ok`, no corruption; but the in-progress edit was lost (H2) |
| 42 | Empty DB / first run | **Pass** | 4 categories + 10 samples created, default column order correct |
| 43 | After the seed-delete button | **Pass** | Only `is_sample` rows removed; user tasks and categories kept |
| 44 | Restore sample after editing a sample | **Fail** | H4 |
| 45 | SQL injection in name, notes, search, category, Pomodoro time | **Pass** | All stored or searched as text; tables intact; Pomodoro value → 400. All queries use `?` or `@named` parameters (dynamic column lists come only from whitelisted keys) |
| 46 | XSS in name, notes, category | **Pass** | Rendered as text, 0 `<img>` elements injected, no alert fired; no `dangerouslySetInnerHTML` anywhere |
| 47 | Malformed JSON / missing fields / bad Status or Priority / wrong types | **Partial** | Proper 400 codes for most cases; wrong types coerced (L5); `pomodoro: "abc"` → 500 |
| 48 | Non-existent / negative / non-numeric IDs | **Pass** | 404 `task_not_found` (except the category PATCH hang, M9) |
| 49 | Stack traces leaked to the client | **Pass** | Only error codes returned; stacks go to the server console |
| 50 | Network exposure | **Pass (API) / Fail (dev server)** | Both bind to 127.0.0.1. No CORS headers (good), but no Host check (H3) |
| 51 | Path traversal | **Pass (API) / Fail (Vite)** | Express returns 404; Vite `@fs` bypass reads `/etc/passwd` (H3) |
| 52 | Outbound network requests | **Pass** | 0 non-localhost requests across all views; no external fonts, CDNs or analytics |
| 53 | `npm audit` | **Fail** | 14 vulnerabilities (9 high, 5 moderate) (M10) |

---

## 4. Actionable Recommendations (by severity)

### High
1. **H1, Board drop target:** Use pointer-first collision for cards, falling back to column lists. For example: for card drags, run `pointerWithin` on the column lists (`col:*`) to choose the column, then `closestCenter` among only that column's cards; fall back to `rectIntersection` if the pointer is outside every list. Add a regression test that drops into an empty column area.
2. **H2, Don't lose edits:** Make `updateTask` return `true`/`false` (like `createTask`/`updateCategory` already do). In `TaskForm.submit`, call `closeTask()` only on success; on failure keep the modal open and show the error inline. Optionally autosave the draft in `sessionStorage` until it's saved.
3. **H3, Lock down the dev server:**
   - Upgrade `vite` to the latest patched 5.4.x (≥ 5.4.21) or 6.x/7.x, and `esbuild` with it.
   - In `vite.config.ts`, set `server.fs.strict: true` and `server.fs.deny: ['data/**', '.env*', '*.db*']`, or move the DB outside the Vite root (e.g., `~/Library/Application Support/Atlas/`).
   - In Express, reject requests whose `Host` isn't `localhost:3001` or `127.0.0.1:3001` (DNS-rebinding guard).
   - In the README, recommend `npm run build && npm start` for daily use instead of `npm run dev`.
4. **H4, Sample restore:** Clear `is_sample` (set it to 0) whenever a sample task is edited (`PATCH`) or linked to a Pomodoro. Add a `confirm()` to the Restore button. Restore should insert only missing samples instead of deleting first.

### Medium
5. **M1, Column order:** Reset your board now via ⚙️ → Reset column order. Then move the column drag to a small dedicated grip (the ⠿ icon) instead of the whole header, raise its activation distance (e.g., 10 px plus a 150 ms delay), and show a toast with **Undo** after a reorder.
6. **M2, Date validation:** In `taskFields`, round-trip the date (`new Date(y, m-1, d)` must give back the same y/m/d), validate time as `^([01]\d|2[0-3]):[0-5]\d$`, and reject or clear `dueTime` when `dueDate` is null or missing (including on PATCH, checked against the stored task).
7. **M3, DST:** Build the due moment with the wall clock instead of adding milliseconds: `const [y,m,d]=…; const [h,mi]=…; new Date(y, m-1, d, h, mi).getTime() < now`.
8. **M4, Multi-tab Pomodoro:** Listen for `window.addEventListener('storage', …)` on `pomodoroState` and apply remote changes, or use a `BroadcastChannel('atlas-pomodoro')`. Make recording idempotent: send a client `sessionKey` (e.g., the `endAt` timestamp) and add `UNIQUE(session_key)` with `INSERT OR IGNORE` on the server.
9. **M5, Calendar overflow:** Show at most 3 items per month cell plus a "+N more" button (translated: `calendar.more` → "+{{count}} more" / "+{{count}} mais") that opens a popover or switches to week view for that day.
10. **M6, Performance:**
    - Debounce search with `useDeferredValue(filters.search)`.
    - `React.memo` the `Card`, `DraggableItem` and table rows.
    - Memoize `categoryMap` separately from tasks.
    - Virtualize tables (e.g., `@tanstack/react-virtual`) above ~200 rows.
11. **M7, API down:** Track a `loadError` state. When the initial load fails, show a full-page message ("Can't reach the Atlas server. Is `npm run dev` running?" / PT equivalent) with a **Retry** button instead of empty columns. Treat proxy 502/503/500 HTML responses as `network`.
12. **M8, Session validation:** Require an integer `durationSec` between 1 and 36,000, and a real calendar date for `localDate` (same round-trip check as M2). Optionally verify `taskId` is an integer.
13. **M9, Hanging route:** In `PATCH /api/categories/:id`, check that the row exists (404) before the `cols.length` branch, and make `wrap()` send `res.status(204).end()` or throw when a handler returns `undefined` without responding.
14. **M10, Dependencies:** `npm i express@^4.22.3 vite@^5.4.21` (or newer majors), and upgrade `postcss` to ≥ 8.5.30 and `tailwindcss` to the latest 3.4.x. Re-run `npm audit` and keep the exact pins.

### Low
15. **L1:** In the error handler, map `err.type === 'entity.too.large'` to 413 `payload_too_large` (translated). Set `express.json({ limit: '1mb' })`, cap the name at ~300 characters and notes at ~50,000 server-side, and mirror the limits with `maxLength` in the UI. Add `app.disable('x-powered-by')`.
16. **L2:** Add `break-words` (`overflow-wrap:anywhere`) to the card title, table name cell and calendar items.
17. **L3:** When `filtered.length === 0` and filters are active, show a translated "No tasks match these filters · Clear filters" banner on the Board and Calendar.
18. **L4:** Validate custom minutes as an integer (or support decimals properly), and don't overwrite a restored `customMinutes` on mount. Only sync it when `settings.custom` actually changes after the settings have loaded.
19. **L5:** Reject non-string `notes` (400 `invalid_notes`) and non-integer or unknown `categoryIds` (400 `invalid_categories`).
20. **L6:** Only recreate sample categories that are missing *by id*, or link samples to existing categories by id instead of by name.
21. **L7:** Replace the native time input with a text field that uses the app locale (`HH:MM` in PT, `h:mm AM/PM` in EN), parsed like `DateInput`.
22. **L8:** Change the proxy target to `http://127.0.0.1:3001`.
23. **L9:** Pick a consistent label style (add an emoji to To-do or remove them all), and decide whether to translate "Backlog" (e.g., "Pendências").
24. **L10:** Rename to `data/atlas.db`, with a one-time migration that renames `tasks.db*` when it exists, or update the spec.
25. **L11:** If the form is dirty, ask "Discard changes?" before closing on backdrop click or Esc.
26. **L12:** Re-render once a minute (or set a timeout at the next local midnight) so "today" and overdue stay current.
27. **L13:** Make Skip use the same `nextMode()` as completion (without recording a session), so the 4th skip leads to a long break and auto-cycle is respected.

---

*Test artefacts (scripts, screenshots, the scratch DB) are in the session scratchpad, not in the project. No source files were modified during this pass.*
