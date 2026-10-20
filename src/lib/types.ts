export type Status = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'high' | 'medium' | 'low';

/** Same limits as the API (server/index.js). */
export const MAX_NAME = 300;
export const MAX_NOTES = 50_000;

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
  /** Ordered checklist (GAME_DESIGN.md §9). */
  stages: Stage[];
}

export interface Stage {
  id: number;
  title: string;
  done: boolean;
  position: number;
  completedAt: string | null;
}

/** Same limits as the API (server/routes/stages.js). */
export const MAX_STAGE_TITLE = 200;
export const MAX_STAGES = 100;

export type TaskInput = Partial<Omit<Task, 'id' | 'createdAt' | 'isSample' | 'stages'>>;

/** Game attributes (GAME_DESIGN.md §2); stable keys, labels in locales (attributes.<KEY>). */
export const ATTRIBUTES = ['INT', 'SENSE', 'STR', 'AGI', 'VIT', 'MIND', 'FAITH', 'CHA', 'WILL', 'DISC'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export interface CategoryAttributes {
  categoryId: number;
  primary: Attribute;
  secondary: Attribute | null;
}

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
