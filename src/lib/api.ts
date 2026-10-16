import type { Category, PomodoroSettings, SessionSummary, Status, Task, TaskInput } from './types';

type Settings = { pomodoro: PomodoroSettings; boardColumns: Status[] };

/** Error carrying the server's stable error code (translated via `errors.<code>`). */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Our API always answers errors with JSON; a 5xx without it comes from the dev proxy
    // (API not running / unreachable), so report it as a network problem.
    if (!data?.error) throw new ApiError(res.status >= 500 ? 'network' : 'server_error');
    throw new ApiError(data.error);
  }
  return (data ?? {}) as T;
}

export const api = {
  listTasks: () => request<Task[]>('GET', '/api/tasks'),
  createTask: (t: TaskInput) => request<Task>('POST', '/api/tasks', t),
  updateTask: (id: number, t: TaskInput) => request<Task>('PATCH', `/api/tasks/${id}`, t),
  deleteTask: (id: number) => request<void>('DELETE', `/api/tasks/${id}`),
  deleteTasks: (ids: number[]) => request<{ removed: number }>('POST', '/api/tasks/bulk-delete', { ids }),

  listCategories: () => request<Category[]>('GET', '/api/categories'),
  createCategory: (c: Partial<Category>) => request<Category>('POST', '/api/categories', c),
  updateCategory: (id: number, c: Partial<Category>) => request<Category>('PATCH', `/api/categories/${id}`, c),
  deleteCategory: (id: number) => request<void>('DELETE', `/api/categories/${id}`),

  getSettings: () => request<Settings>('GET', '/api/settings'),
  saveSettings: (s: { pomodoro?: Partial<PomodoroSettings>; boardColumns?: Status[] }) =>
    request<Settings>('PUT', '/api/settings', s),

  recordSession: (s: {
    taskId: number | null;
    mode: 'pomodoro' | 'custom';
    durationSec: number;
    localDate: string;
    sessionKey: string;
  }) =>
    request<void>('POST', '/api/sessions', s),
  sessionSummary: (date: string) => request<SessionSummary>('GET', `/api/sessions/summary?date=${date}`),

  restoreSample: () => request<{ inserted: number }>('POST', '/api/sample'),
  removeSample: () => request<{ removed: number }>('DELETE', '/api/sample'),
};
