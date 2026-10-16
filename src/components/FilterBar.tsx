import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EMPTY_FILTERS,
  PRIORITIES,
  PRIORITY_COLORS,
  STATUSES,
  STATUS_COLORS,
  type Filters,
  type Task,
} from '../lib/types';
import { useData, useUi } from '../store';
import { Pill } from './Badges';

export function applyFilters(tasks: Task[], f: Filters): Task[] {
  const q = f.search.trim().toLowerCase();
  return tasks.filter(
    (x) =>
      (!q || x.name.toLowerCase().includes(q) || x.notes.toLowerCase().includes(q)) &&
      (!f.statuses.length || f.statuses.includes(x.status)) &&
      (!f.priorities.length || (x.priority && f.priorities.includes(x.priority))) &&
      (!f.categories.length || x.categoryIds.some((c) => f.categories.includes(c))),
  );
}

export function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const { t } = useTranslation();
  const { categories } = useData();
  const { openTask } = useUi();
  const active = filters.search || filters.categories.length || filters.priorities.length || filters.statuses.length;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
      <div className="relative w-full sm:w-64">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">🔍</span>
        <input
          type="search"
          className="input pl-8"
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <MultiSelect
        label={t('fields.category')}
        selected={filters.categories}
        onChange={(categories) => onChange({ ...filters, categories })}
        options={categories.map((c) => ({ value: c.id, node: <Pill color={c.color}>{c.name}</Pill> }))}
      />
      <MultiSelect
        label={t('fields.priority')}
        selected={filters.priorities}
        onChange={(priorities) => onChange({ ...filters, priorities })}
        options={PRIORITIES.map((p) => ({ value: p, node: <Pill color={PRIORITY_COLORS[p]}>{t(`priority.${p}`)}</Pill> }))}
      />
      <MultiSelect
        label={t('fields.status')}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
        options={STATUSES.map((s) => ({ value: s, node: <Pill color={STATUS_COLORS[s]}>{t(`status.${s}`)}</Pill> }))}
      />
      {!!active && (
        <button className="btn-text" onClick={() => onChange(EMPTY_FILTERS)}>
          {t('filters.clear')}
        </button>
      )}
      <div className="flex-1" />
      <button className="btn btn-primary" onClick={() => openTask(null)}>
        + {t('task.newShort')}
      </button>
    </div>
  );
}

function MultiSelect<T extends string | number>({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: T; node: ReactNode }[];
  selected: T[];
  onChange: (v: T[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div className="relative">
      <button
        className={`btn ${selected.length ? 'border-accent text-accent' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={t('filters.filterBy', { field: label })}
      >
        {label}
        {selected.length > 0 && <span className="ml-1 rounded bg-accent px-1 text-xs text-white">{selected.length}</span>}
        <span className="ml-1 text-xs text-muted">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-10 z-40 max-h-72 w-60 overflow-y-auto rounded-md bg-surface p-1 shadow-pop">
            {options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-hover">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.node}
              </label>
            ))}
            {!options.length && <p className="px-2 py-1.5 text-sm text-muted">{t('filters.noOptions')}</p>}
          </div>
        </>
      )}
    </div>
  );
}
