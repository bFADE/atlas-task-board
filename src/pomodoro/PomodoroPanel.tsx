import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTime, toDateStr } from '../lib/dates';
import { useData, useLang, useUi } from '../store';
import { TIMER_MODES, formatClock, usePomodoro } from './PomodoroProvider';

const MODE_COLORS = { pomodoro: '#E03E3E', short: '#0F7B6C', long: '#2383E2', custom: '#6940A5' } as const;

/** Floating button + panel, available from every view. */
export function PomodoroWidget() {
  const { t } = useTranslation();
  const p = usePomodoro();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) p.refreshSummary();
  }, [open, p.refreshSummary]);

  return (
    <>
      {open && <Panel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t('pomodoro.toggle')}
        aria-label={t('pomodoro.toggle')}
        className="fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full bg-surface px-4 font-semibold shadow-pop transition hover:scale-105"
        style={p.phase !== 'idle' ? { color: MODE_COLORS[p.mode] } : undefined}
      >
        <span className="text-xl">🍅</span>
        {p.phase !== 'idle' && <span className="tabular-nums">{formatClock(p.remaining)}</span>}
      </button>
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const p = usePomodoro();
  const { tasks, pomodoroSettings } = useData();
  const { setSettingsOpen } = useUi();
  const [customText, setCustomText] = useState(String(p.customMinutes));
  const [customInvalid, setCustomInvalid] = useState(false);
  useEffect(() => setCustomText(String(p.customMinutes)), [p.customMinutes]);

  const color = MODE_COLORS[p.mode];
  const progress = p.durationMs ? 1 - Math.max(0, p.remaining) / p.durationMs : 0;
  const activeTasks = tasks.filter((x) => x.status !== 'done' || x.id === p.taskId);

  return (
    <div
      role="dialog"
      aria-label={t('pomodoro.title')}
      className="fixed bottom-20 right-4 z-40 max-h-[calc(100vh-6rem)] w-[360px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl bg-surface p-4 shadow-pop"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">🍅 {t('pomodoro.title')}</h2>
        <div className="flex gap-1">
          <button className="btn-icon" onClick={() => setSettingsOpen(true)} title={t('pomodoro.settings')} aria-label={t('pomodoro.settings')}>
            ⚙️
          </button>
          <button className="btn-icon" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-panel p-1 text-[11px] leading-tight" role="tablist">
        {TIMER_MODES.map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={p.mode === m}
            onClick={() => p.setMode(m)}
            className={`rounded-md px-1 py-1.5 font-medium ${p.mode === m ? 'bg-surface shadow-card' : 'text-muted hover:text-fg'}`}
            style={p.mode === m ? { color: MODE_COLORS[m] } : undefined}
          >
            {t(`pomodoro.modes.${m}`)}
          </button>
        ))}
      </div>

      {p.mode === 'custom' && (
        <label className="mt-3 flex items-center justify-center gap-2 text-sm">
          {t('pomodoro.customMinutes')}
          <input
            type="number"
            min={1}
            max={600}
            step={1}
            className={`input w-20 text-center ${customInvalid ? 'border-danger' : ''}`}
            aria-invalid={customInvalid}
            value={customText}
            disabled={p.phase === 'running'}
            onChange={(e) => {
              setCustomText(e.target.value);
              setCustomInvalid(false);
            }}
            onBlur={() => {
              // Whole minutes only (1–600); anything else is rejected, not rounded.
              const n = Number(customText);
              const ok = customText.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 600;
              setCustomInvalid(!ok);
              if (ok) p.setCustomMinutes(n);
              else setCustomText(String(p.customMinutes));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {t('pomodoro.min')}
        </label>
      )}
      {p.mode === 'custom' && customInvalid && (
        <p role="alert" className="mt-1 text-center text-xs text-danger">
          {t('pomodoro.customInvalid')}
        </p>
      )}

      <div className="my-4 text-center">
        <div className="font-mono text-6xl font-bold tabular-nums tracking-tight" style={{ color }} aria-live="off">
          {formatClock(p.remaining)}
        </div>
        <div className="mx-auto mt-3 h-1.5 w-full overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
        </div>
      </div>

      <div className="flex justify-center gap-2">
        {p.phase === 'running' ? (
          <button className="btn btn-primary min-w-[96px]" onClick={p.pause}>
            ⏸ {t('pomodoro.pause')}
          </button>
        ) : (
          <button className="btn btn-primary min-w-[96px]" onClick={p.start}>
            ▶ {p.phase === 'paused' ? t('pomodoro.resume') : t('pomodoro.start')}
          </button>
        )}
        <button className="btn" onClick={p.reset} title={t('pomodoro.resetHint')}>
          ↺ {t('pomodoro.reset')}
        </button>
        <button className="btn" onClick={p.skip} title={t('pomodoro.skipHint')}>
          ⏭ {t('pomodoro.skip')}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-1" title={t('pomodoro.cycleHint')}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-2 w-2 rounded-full ${i < p.cycle ? 'bg-danger' : 'bg-line'}`} />
          ))}
          <span className="ml-1">{t('pomodoro.cycle', { count: Math.min(p.cycle, 4) })}</span>
        </span>
        <span>{pomodoroSettings.autoCycle ? t('pomodoro.autoOn') : t('pomodoro.autoOff')}</span>
      </div>

      <label className="mt-4 block text-sm">
        <span className="field-label mb-1 block">{t('pomodoro.linkTask')}</span>
        <select
          className="input"
          value={p.taskId ?? ''}
          onChange={(e) => p.setTaskId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('pomodoro.noTask')}</option>
          {activeTasks.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 border-t border-line pt-3">
        <h3 className="mb-2 text-sm font-semibold">{t('pomodoro.today')}</h3>
        <div className="mb-2 flex gap-4 text-sm">
          <span>
            🍅 <b>{p.summary?.pomodoros ?? 0}</b> {t('pomodoro.completed', { count: p.summary?.pomodoros ?? 0 })}
          </span>
          <span>
            ⏱ <b>{p.summary?.focusMinutes ?? 0}</b> {t('pomodoro.focusMinutes')}
          </span>
        </div>
        {p.summary?.sessions.length ? (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {p.summary.sessions.map((s) => {
              const d = new Date(s.completedAt);
              const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
              return (
                <li key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-hover" title={toDateStr(d)}>
                  <span className="w-14 shrink-0 text-muted">{formatTime(hhmm, lang)}</span>
                  <span className="flex-1 truncate">{s.taskName ?? <i className="text-muted">{t('pomodoro.noTask')}</i>}</span>
                  <span className="shrink-0 text-muted">
                    {Math.round(s.durationSec / 60)} {t('pomodoro.min')}
                    {s.mode === 'custom' && ` · ${t('pomodoro.modes.custom')}`}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted">{t('pomodoro.noSessions')}</p>
        )}
      </div>
    </div>
  );
}
