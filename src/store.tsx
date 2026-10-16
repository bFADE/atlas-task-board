import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './lib/api';
import { STATUSES, type Category, type PomodoroSettings, type Status, type Task, type TaskInput } from './lib/types';
import type { Lang } from './lib/dates';

// ---------- Toasts ----------

interface Toast {
  id: number;
  text: string;
  kind: 'error' | 'info';
}

// ---------- Data ----------

interface DataCtx {
  loading: boolean;
  tasks: Task[];
  categories: Category[];
  categoryMap: Map<number, Category>;
  pomodoroSettings: PomodoroSettings;
  boardColumns: Status[];
  saveBoardColumns: (cols: Status[]) => Promise<void>;
  deleteTasks: (ids: number[]) => Promise<void>;
  createTask: (t: TaskInput) => Promise<Task | null>;
  updateTask: (id: number, t: TaskInput) => Promise<void>;
  deleteTask: (id: number) => Promise<void>;
  createCategory: (name: string, color: string) => Promise<Category | null>;
  updateCategory: (id: number, c: Partial<Category>) => Promise<boolean>;
  deleteCategory: (id: number) => Promise<void>;
  savePomodoroSettings: (p: Partial<PomodoroSettings>) => Promise<boolean>;
  restoreSample: () => Promise<void>;
  removeSample: () => Promise<void>;
  notify: (text: string, kind?: Toast['kind']) => void;
  reportError: (err: unknown) => void;
}

const DEFAULT_POMODORO: PomodoroSettings = { pomodoro: 25, short: 5, long: 15, custom: 10, autoCycle: false };

const DataContext = createContext<DataCtx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(DEFAULT_POMODORO);
  const [boardColumns, setBoardColumns] = useState<Status[]>(STATUSES);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = ++toastId.current;
    setToasts((ts) => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4000);
  }, []);

  const reportError = useCallback(
    (err: unknown) => {
      const code = err instanceof ApiError ? err.code : 'server_error';
      notify(t(`errors.${code}`, { defaultValue: t('errors.server_error') }), 'error');
    },
    [notify, t],
  );

  const reload = useCallback(async () => {
    try {
      const [ts, cs, s] = await Promise.all([api.listTasks(), api.listCategories(), api.getSettings()]);
      setTasks(ts);
      setCategories(cs);
      setPomodoroSettings(s.pomodoro);
      setBoardColumns(s.boardColumns);
    } catch (err) {
      reportError(err);
    } finally {
      setLoading(false);
    }
  }, [reportError]);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo<DataCtx>(() => {
    const replaceTask = (task: Task) => setTasks((ts) => ts.map((x) => (x.id === task.id ? task : x)));
    return {
      loading,
      tasks,
      categories,
      categoryMap: new Map(categories.map((c) => [c.id, c])),
      pomodoroSettings,
      boardColumns,
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

      // Optimistic: the UI (drag and drop, inline selects) updates immediately.
      async updateTask(id, input) {
        const prev = tasks.find((x) => x.id === id);
        if (!prev) return;
        setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, ...input } : x)));
        try {
          replaceTask(await api.updateTask(id, input));
        } catch (err) {
          replaceTask(prev);
          reportError(err);
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
        const prev = boardColumns;
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
          setTasks((ts) => ts.map((x) => ({ ...x, categoryIds: x.categoryIds.filter((c) => c !== id) })));
        } catch (err) {
          reportError(err);
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
  }, [loading, tasks, categories, pomodoroSettings, boardColumns, notify, reportError, reload, t]);

  return (
    <DataContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((x) => (
          <div
            key={x.id}
            role={x.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-md px-4 py-2 text-sm text-white shadow-pop ${
              x.kind === 'error' ? 'bg-danger' : 'bg-neutral-800'
            }`}
          >
            {x.text}
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

  const value = useMemo<UiCtx>(
    () => ({
      taskModal,
      openTask: (task, defaults) => setTaskModal({ task, defaults }),
      closeTask: () => setTaskModal(null),
      confirmState,
      confirm: (message, confirmLabel) =>
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
      settingsOpen,
      setSettingsOpen,
    }),
    [taskModal, confirmState, settingsOpen],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi outside UiProvider');
  return ctx;
}

export function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language === 'pt' ? 'pt' : 'en';
}
