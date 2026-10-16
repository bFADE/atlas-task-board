export type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'high' | 'medium' | 'low';

export const STATUSES: Status[] = ['backlog', 'todo', 'in_progress', 'blocked', 'done'];
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export const STATUS_COLORS: Record<Status, string> = {
  backlog: '#9B9A97',
  todo: '#D9730D',
  in_progress: '#2383E2',
  blocked: '#E03E3E',
  done: '#0F7B6C',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  high: '#E03E3E',
  medium: '#DFAB01',
  low: '#0F7B6C',
};

/** Notion-like palette offered when picking a category color. */
export const CATEGORY_PALETTE = [
  '#9B9A97', '#64473A', '#D9730D', '#DFAB01', '#0F7B6C',
  '#0B6E99', '#6940A5', '#AD1A72', '#E03E3E',
];

export interface Task {
  id: number;
  name: string;
  status: Status;
  priority: Priority | null;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  notes: string;
  createdAt: string; // ISO
  position: number;
  isSample: boolean;
  categoryIds: number[];
}

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'isSample'>>;

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface PomodoroSettings {
  pomodoro: number;
  short: number;
  long: number;
  custom: number;
  autoCycle: boolean;
}

export interface SessionSummary {
  pomodoros: number;
  focusMinutes: number;
  sessions: {
    id: number;
    mode: 'pomodoro' | 'custom';
    durationSec: number;
    completedAt: string;
    taskId: number | null;
    taskName: string | null;
  }[];
}

export interface Filters {
  search: string;
  categories: number[];
  priorities: Priority[];
  statuses: Status[];
}

export const EMPTY_FILTERS: Filters = { search: '', categories: [], priorities: [], statuses: [] };
