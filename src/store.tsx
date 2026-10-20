import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './lib/api';
import { STATUSES, type Attribute, type Category, type CategoryAttributes, type PomodoroSettings, type Status, type Task, type TaskInput } from './lib/types';
import type { Lang } from './lib/dates';

// ---------- Toasts ----------

interface ToastAction {
  label: string;
  run: () => void;
}

interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
  action?: ToastAction;
}

// ---------- Data ----------

interface DataCtx {
  loading: boolean;
  /** The first load failed (API not reachable); the app shows a retry screen instead of empty views. */
  loadError: boolean;
  retryLoad: () => void;
  tasks: Task[];
  categories: Category[];
  categoryMap: Map<number, Category>;
  /** Category → game attributes (one entry per mapped category). */
  categoryAttributes: CategoryAttributes[];
  /** primary null clears the mapping. */
  saveCategoryAttributes: (categoryId: number, primary: Attribute | null, secondary: Attribute | null) => Promise<boolean>;
  pomodoroSettings: PomodoroSettings;
  boardColumns: Status[];
  saveBoardColumns: (cols: Status[]) => Promise<void>;
  deleteTasks: (ids: number[]) => Promise<void>;
  createTask: (t: TaskInput & { stages?: string[] }) => Promise<Task | null>;
  addStage: (taskId: number, title: string) => Promise<boolean>;
  updateStage: (taskId: number, stageId: number, s: { title?: string; done?: boolean }) => Promise<boolean>;
  deleteStage: (taskId: number, stageId: number) => Promise<boolean>;
  reorderStages: (taskId: number, ids: number[]) => Promise<boolean>;
  /** Resolves to false (after rolling back and showing a toast) when the save fails. */
  updateTask: (id: number, t: TaskInput) => Promise<boolean>;
  deleteTask: (id: number) => Promise<void>;
  createCategory: (name: string, color: string) => Promise<Category | null>;
  updateCategory: (id: number, c: Partial<Category>) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<void>;
  savePomodoroSettings: (p: Partial<PomodoroSettings>) => Promise<boolean>;
  restoreSample: () => Promise<void>;
  removeSample: () => Promise<void>;
  notify: (text: string, kind?: Toast['kind'], action?: ToastAction) => void;
  reportError: (err: unknown) => void;
}

const DEFAULT_POMODORO: PomodoroSettings = { pomodoro: 25, short: 5, long: 15, custom: 10, autoCycle: false };

const DataContext = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadedOnce = useRef(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [boardColumns, setBoardColumns] = useState<Status[]>(STATUSES);
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttributes[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (text: string, kind: Toast['kind'] = 'info', action?: ToastAction) => {
      const id = ++toastId.current;
      setToasts((ts) => [...ts, { id, text, kind, action }]);
      setTimeout(() => dismiss(id), action ? 8000 : 4000);
    },
    [dismiss],
  );

  const reportError = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : 'server_error';
      notify(t(`errors.${code}`, { defaultValue: t('errors.server_error') }), 'error');
    },
    [notify, t],
  );

  const reload = useCallback(async () => {
    try {
      const [ts, cs, s, ca] = await Promise.all([
        api.listTasks(),
        api.listCategories(),
        api.getSettings(),
        api.listCategoryAttributes(),
      ]);
      setTasks(ts);
      setCategories(cs);
      setCategoryAttributes(ca);
      setPomodoroSettings(s.pomodoro);
      setBoardColumns(s.boardColumns);
      loadedOnce.current = true;
      setLoadError(false);
    } catch (err) {
      if (loadedOnce.current) reportError(err);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Actions read the latest data through refs so their identity doesn't change on every task edit;
  // memoized cards/rows that receive them don't re-render needlessly.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const boardColumnsRef = useRef(boardColumns);
  boardColumnsRef.current = boardColumns;
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    reload();
  }, [reload]);

  type Actions = Omit<
    DataCtx,
    'loading' | 'loadError' | 'retryLoad' | 'tasks' | 'categories' | 'categoryMap' | 'categoryAttributes' | 'pomodoroSettings' | 'boardColumns'
  >;
  const actions = useMemo<Actions>(() => {
    const replaceTask = (task: Task) => setTasks((ts) => ts.map((x) => (x.id === task.id ? task : x)));
    return {
      notify,
      reportError,

      async createTask(input) {
        try {
          const task = await api.createTask(input);
          setTasks((ts) => [...ts, task]);
          return task;
        } catch (err) {
          reportError(err);
          return null;
        }
      },

      // Stages: optimistic local change, then the server's version of the task (or a rollback).
      ...(() => {
        const stageOp = async (taskId: number, local: ((t: Task) => Task) | null, call: () => Promise<Task>) => {
          const prev = tasksRef.current.find((x) => x.id === taskId);
          if (!prev) return false;
          if (local) setTasks((ts) => ts.map((x) => (x.id === taskId ? local(x) : x)));
          try {
            replaceTask(await call());
            return true;
          } catch (err) {
            replaceTask(prev);
            reportError(err);
            return false;
          }
        };
        return {
          addStage: (taskId: number, title: string) => stageOp(taskId, null, () => api.addStage(taskId, title)),
          updateStage: (taskId: number, stageId: number, s: { title?: string; done?: boolean }) =>
            stageOp(
              taskId,
              (t) => ({ ...t, stages: t.stages.map((x) => (x.id === stageId ? { ...x, ...s } : x)) }),
              () => api.updateStage(stageId, s),
            ),
          deleteStage: (taskId: number, stageId: number) =>
            stageOp(taskId, (t) => ({ ...t, stages: t.stages.filter((x) => x.id !== stageId) }), () => api.deleteStage(stageId)),
          reorderStages: (taskId: number, ids: number[]) =>
            stageOp(
              taskId,
              (t) => ({ ...t, stages: ids.map((id) => t.stages.find((x) => x.id === id)!).filter(Boolean) }),
              () => api.reorderStages(taskId, ids),
            ),
        };
      })(),

      // Optimistic: the UI (drag and drop, inline selects) updates immediately.
      async updateTask(id, input) {
        const prev = tasksRef.current.find((x) => x.id === id);
        if (!prev) return false;
        setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...input } : x)));
        try {
          replaceTask(await api.updateTask(id, input));
          return true;
        } catch (err) {
          replaceTask(prev);
          reportError(err);
          return false;
        }
      },

      async deleteTask(id) {
        try {
          await api.deleteTask(id);
          setTasks((ts) => ts.filter((x) => x.id !== id));
        } catch (err) {
          reportError(err);
        }
      },

      async deleteTasks(ids) {
        try {
          await api.deleteTasks(ids);
          const gone = new Set(ids);
          setTasks((ts) => ts.filter((x) => !gone.has(x.id)));
          notify(t('selection.deleted', { count: ids.length }));
        } catch (err) {
          reportError(err);
        }
      },

      // Optimistic, like task moves on the board.
      async saveBoardColumns(cols) {
        const prev = boardColumnsRef.current;
        setBoardColumns(cols);
        try {
          setBoardColumns((await api.saveSettings({ boardColumns: cols })).boardColumns);
        } catch (err) {
          setBoardColumns(prev);
          reportError(err);
        }
      },

      async createCategory(name, color) {
        try {
          const c = await api.createCategory({ name, color });
          setCategories((cs) => [...cs, c]);
          // The server may have applied a suggested attribute mapping (e.g. "Gym" → STR/VIT).
          api.listCategoryAttributes().then(setCategoryAttributes).catch(() => {});
          return c;
        } catch (err) {
          reportError(err);
          return null;
        }
      },

      async updateCategory(id, input) {
        try {
          const c = await api.updateCategory(id, input);
          setCategories((cs) => cs.map((x) => (x.id === id ? c : x)));
          return true;
        } catch (err) {
          reportError(err);
          return false;
        }
      },

      async deleteCategory(id) {
        try {
          await api.deleteCategory(id);
          setCategories((cs) => cs.filter((x) => x.id !== id));
          setCategoryAttributes((ca) => ca.filter((x) => x.categoryId !== id));
          setTasks((ts) => ts.map((x) => ({ ...x, categoryIds: x.categoryIds.filter((c) => c !== id) })));
        } catch (err) {
          reportError(err);
        }
      },

      async saveCategoryAttributes(categoryId, primary, secondary) {
        try {
          if (primary === null) {
            await api.clearCategoryAttributes(categoryId);
            setCategoryAttributes((ca) => ca.filter((x) => x.categoryId !== categoryId));
          } else {
            const saved = await api.setCategoryAttributes(categoryId, primary, secondary);
            setCategoryAttributes((ca) => [...ca.filter((x) => x.categoryId !== categoryId), saved]);
          }
          return true;
        } catch (err) {
          reportError(err);
          return false;
        }
      },

      async savePomodoroSettings(p) {
        try {
          const s = await api.saveSettings({ pomodoro: p });
          setPomodoroSettings(s.pomodoro);
          return true;
        } catch (err) {
          reportError(err);
          return false;
        }
      },

      async restoreSample() {
        try {
          const { inserted } = await api.restoreSample();
          await reload();
          notify(t('settings.sampleRestored', { count: inserted }));
        } catch (err) {
          reportError(err);
        }
      },

      async removeSample() {
        try {
          const { removed } = await api.removeSample();
          await reload();
          notify(t('settings.sampleRemoved', { count: removed }));
        } catch (err) {
          reportError(err);
        }
      },
    };
  }, [notify, reportError, reload, t]);

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      loadError,
      retryLoad,
      tasks,
      categories,
      categoryMap,
      categoryAttributes,
      pomodoroSettings,
      boardColumns,
      ...actions,
    }),
    [loading, loadError, retryLoad, tasks, categories, categoryMap, categoryAttributes, pomodoroSettings, boardColumns, actions],
  );

  return (
    <DataContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            role={x.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-center gap-3 rounded-md px-4 py-2 text-sm text-white shadow-pop ${
              x.kind === 'error' ? 'bg-danger' : 'bg-neutral-800'
            }`}
          >
            {x.text}
            {x.action && (
              <button
                className="rounded px-2 py-0.5 font-semibold text-sky-300 hover:bg-white/10"
                onClick={() => {
                  x.action!.run();
                  dismiss(x.id);
                }}
              >
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData outside DataProvider');
  return ctx;
}

// ---------- UI (task modal + confirm dialog) ----------

export interface TaskModalState {
  task: Task | null; // null = create
  defaults?: TaskInput;
}

interface ConfirmState {
  message: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

interface UiCtx {
  taskModal: TaskModalState | null;
  openTask: (task: Task | null, defaults?: TaskInput) => void;
  closeTask: () => void;
  confirmState: ConfirmState | null;
  confirm: (message: string, confirmLabel?: string) => Promise<boolean>;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const UiContext = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Stable callbacks: memoized cards/rows receive them as props.
  const openTask = useCallback((task: Task | null, defaults?: TaskInput) => setTaskModal({ task, defaults }), []);
  const closeTask = useCallback(() => setTaskModal(null), []);
  const confirm = useCallback(
    (message: string, confirmLabel?: string) =>
      new Promise<boolean>((resolve) =>
        setConfirmState({
          message,
          confirmLabel,
          resolve: (ok) => {
            setConfirmState(null);
            resolve(ok);
          },
        }),
      ),
    [],
  );

  const value = useMemo<UiCtx>(
    () => ({ taskModal, openTask, closeTask, confirmState, confirm, settingsOpen, setSettingsOpen }),
    [taskModal, openTask, closeTask, confirmState, confirm, settingsOpen],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi outside UiProvider');
  return ctx;
}

// ---------- Clock ----------

const ClockContext = createContext<number>(Date.now());

/**
 * Re-renders consumers at every minute boundary (and when the tab becomes visible again), so
 * "today" and overdue highlighting stay correct when the app is left open, e.g. overnight.
 */
export function ClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(Date.now());
        schedule();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    schedule();
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

export const useNow = () => new Date(useContext(ClockContext));

export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language === 'pt' ? 'pt' : 'en';
}
