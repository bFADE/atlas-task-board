import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { load, save } from '../lib/storage';
import { todayStr } from '../lib/dates';
import type { SessionSummary } from '../lib/types';
import { useData } from '../store';
import { playChime, unlockAudio } from './sound';

export type TimerMode = 'pomodoro' | 'short' | 'long' | 'custom';
export const TIMER_MODES: TimerMode[] = ['pomodoro', 'short', 'long', 'custom'];
export type Phase = 'idle' | 'running' | 'paused';

interface TimerState {
  mode: TimerMode;
  phase: Phase;
  endAt: number | null; // epoch ms, set while running
  remainingMs: number; // used while idle/paused
  cycle: number; // pomodoros completed in the current 4-cycle
  taskId: number | null;
  customMinutes: number;
}

interface PomodoroCtx extends TimerState {
  remaining: number; // ms, live
  durationMs: number;
  summary: SessionSummary | null;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setMode: (m: TimerMode) => void;
  setTaskId: (id: number | null) => void;
  setCustomMinutes: (n: number) => void;
  refreshSummary: () => void;
}

const Ctx = createContext<PomodoroCtx | null>(null);
const STORAGE_KEY = 'pomodoroState';
const COMPLETED_KEY = 'pomodoroCompleted';

/** First tab to see a timer end (identified by its endAt) wins; the others skip chime/notify/log. */
function claimCompletion(endAt: number): boolean {
  try {
    if (localStorage.getItem(COMPLETED_KEY) === String(endAt)) return false;
    localStorage.setItem(COMPLETED_KEY, String(endAt));
  } catch {
    /* storage unavailable: single tab, nothing to coordinate */
  }
  return true;
}

export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { pomodoroSettings: settings, tasks, reportError, loading } = useData();
  const hadSavedState = useRef(load<TimerState | null>(STORAGE_KEY, null) !== null).current;

  const minutesFor = useCallback(
    (mode: TimerMode, custom: number) => (mode === 'custom' ? custom : settings[mode]),
    [settings],
  );

  const [state, setState] = useState<TimerState>(() =>
    load<TimerState>(STORAGE_KEY, {
      mode: 'pomodoro',
      phase: 'idle',
      endAt: null,
      remainingMs: 25 * 60_000,
      cycle: 0,
      taskId: null,
      customMinutes: 10,
    }),
  );
  const [now, setNow] = useState(Date.now());
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const durationMs = minutesFor(state.mode, state.customMinutes) * 60_000;
  const remaining = state.phase === 'running' && state.endAt ? state.endAt - now : state.remainingMs;

  useEffect(() => save(STORAGE_KEY, state), [state]);

  // Several tabs share one timer: adopt changes (start, pause, reset, completion) made in another tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        setState(JSON.parse(e.newValue) as TimerState);
        setTimeout(refreshSummary, 800); // the other tab may have just logged a session
      } catch {
        /* ignore malformed value */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Keep an idle timer in sync with edited durations.
  useEffect(() => {
    setState((s) => (s.phase === 'idle' ? { ...s, remainingMs: minutesFor(s.mode, s.customMinutes) * 60_000 } : s));
  }, [minutesFor]);

  // The Custom field starts from the saved default on first use and follows it when the setting is
  // edited, but a value restored from a previous session is kept.
  const syncedCustom = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return; // settings still hold the built-in defaults
    const first = syncedCustom.current === null;
    const changed = !first && syncedCustom.current !== settings.custom;
    syncedCustom.current = settings.custom;
    if (first ? hadSavedState : !changed) return;
    setState((s) =>
      s.mode === 'custom' && s.phase !== 'idle'
        ? s
        : {
            ...s,
            customMinutes: settings.custom,
            remainingMs: s.phase === 'idle' && s.mode === 'custom' ? settings.custom * 60_000 : s.remainingMs,
          },
    );
  }, [settings.custom, loading, hadSavedState]);

  const refreshSummary = useCallback(() => {
    api.sessionSummary(todayStr()).then(setSummary).catch(() => {});
  }, []);
  useEffect(refreshSummary, [refreshSummary]);

  // ---- Completion ----

  const completedFor = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  /** What follows a *completed* timer: 3 short breaks, then a long break after the 4th pomodoro. */
  const nextMode = (mode: TimerMode, cycle: number): { mode: TimerMode; cycle: number } => {
    if (mode === 'pomodoro') return { mode: cycle + 1 >= 4 ? 'long' : 'short', cycle: cycle + 1 };
    if (mode === 'long') return { mode: 'pomodoro', cycle: 0 };
    if (mode === 'short') return { mode: 'pomodoro', cycle };
    return { mode: 'custom', cycle };
  };

  const complete = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'running' || !s.endAt || completedFor.current === s.endAt) return;
    completedFor.current = s.endAt;
    // Another tab already handled this completion; its new state arrives via the storage event.
    if (!claimCompletion(s.endAt)) return;

    playChime();
    const lang = i18n.language;
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(t(`pomodoro.notify.${s.mode}Title`, { lng: lang }), {
          body: t(`pomodoro.notify.${s.mode}Body`, { lng: lang }),
          icon: '/favicon.svg',
        });
      } catch {
        /* some browsers only allow notifications from a service worker */
      }
    }

    const fullMs = minutesFor(s.mode, s.customMinutes) * 60_000;
    if (s.mode === 'pomodoro' || s.mode === 'custom') {
      api
        .recordSession({
          taskId: s.taskId,
          mode: s.mode,
          durationSec: Math.round(fullMs / 1000),
          localDate: todayStr(),
          sessionKey: String(s.endAt),
        })
        .then(refreshSummary)
        .catch(reportError);
    }

    const next = nextMode(s.mode, s.cycle);
    const nextMs = minutesFor(next.mode, s.customMinutes) * 60_000;
    const auto = settings.autoCycle && s.mode !== 'custom';
    setState({
      ...s,
      mode: next.mode,
      cycle: next.cycle,
      phase: auto ? 'running' : 'idle',
      endAt: auto ? Date.now() + nextMs : null,
      remainingMs: nextMs,
    });
  }, [i18n, t, minutesFor, refreshSummary, reportError, settings.autoCycle]);

  // Re-render a few times per second while running; a one-shot timeout fires completion on time
  // even when the tab is in the background (where repeating timers get throttled).
  useEffect(() => {
    if (state.phase !== 'running' || !state.endAt) return;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() >= state.endAt!) complete();
    };
    tick();
    const interval = setInterval(tick, 250);
    const timeout = setTimeout(tick, Math.max(0, state.endAt - Date.now()) + 20);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [state.phase, state.endAt, complete]);

  // Tab title shows the remaining time while a timer is active.
  useEffect(() => {
    const appTitle = t('app.title');
    document.title =
      state.phase === 'idle' ? appTitle : `${state.phase === 'paused' ? '⏸ ' : ''}${formatClock(remaining)} · ${t(`pomodoro.modes.${state.mode}`)} — ${appTitle}`;
  }, [remaining, state.phase, state.mode, t, i18n.language]);

  // Drop the link if the task was deleted.
  useEffect(() => {
    if (state.taskId != null && tasks.length && !tasks.some((x) => x.id === state.taskId)) {
      setState((s) => ({ ...s, taskId: null }));
    }
  }, [tasks, state.taskId]);

  const value = useMemo<PomodoroCtx>(() => {
    const goIdle = (mode: TimerMode, extra: Partial<TimerState> = {}) =>
      setState((s) => {
        const custom = extra.customMinutes ?? s.customMinutes;
        return { ...s, ...extra, mode, phase: 'idle', endAt: null, remainingMs: minutesFor(mode, custom) * 60_000 };
      });
    return {
      ...state,
      remaining,
      durationMs,
      summary,
      refreshSummary,
      start() {
        unlockAudio();
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        setState((s) => (s.phase === 'running' ? s : { ...s, phase: 'running', endAt: Date.now() + s.remainingMs }));
        setNow(Date.now());
      },
      pause() {
        setState((s) =>
          s.phase === 'running' && s.endAt ? { ...s, phase: 'paused', remainingMs: Math.max(0, s.endAt - Date.now()), endAt: null } : s,
        );
      },
      reset: () => goIdle(state.mode),
      // Skip follows the same cycle as a finished timer (the 4th pomodoro leads to the long break)
      // but records no session and plays nothing. With auto-cycle on, a started timer keeps going.
      skip() {
        const next = state.mode === 'custom' ? { mode: 'pomodoro' as const, cycle: state.cycle } : nextMode(state.mode, state.cycle);
        const nextMs = minutesFor(next.mode, state.customMinutes) * 60_000;
        const auto = settings.autoCycle && state.phase !== 'idle';
        setState((s) => ({
          ...s,
          mode: next.mode,
          cycle: next.cycle,
          phase: auto ? 'running' : 'idle',
          endAt: auto ? Date.now() + nextMs : null,
          remainingMs: nextMs,
        }));
      },
      setMode: (m) => goIdle(m),
      setTaskId: (taskId) => setState((s) => ({ ...s, taskId })),
      setCustomMinutes(n) {
        if (!Number.isInteger(n) || n < 1 || n > 600) return;
        goIdle('custom', { customMinutes: n });
      },
    };
  }, [state, remaining, durationMs, summary, refreshSummary, minutesFor, settings.autoCycle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePomodoro outside PomodoroProvider');
  return ctx;
}
