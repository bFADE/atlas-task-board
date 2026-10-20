import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, PRIORITY_COLORS, STATUSES, STATUS_COLORS, type Priority, type Status, type Task, type TaskInput } from '../lib/types';
import { formatDue, isOverdue, type Lang } from '../lib/dates';
import { useData, useLang, useNow, useUi } from '../store';
import { StageProgress } from '../components/Stages';

type Key = 'status' | 'priority' | 'name' | 'notes' | 'dueDate';
type Sort = { key: Key; dir: 'asc' | 'desc' };
const COLUMNS: Key[] = ['status', 'priority', 'name', 'notes', 'dueDate'];
const VIRTUALIZE_ABOVE = 200;
const ROW_HEIGHT = 41;

function compare(a: Task, b: Task, key: Key): number | null {
  switch (key) {
    case 'status':
      return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
    case 'priority':
      if (!a.priority || !b.priority) return a.priority === b.priority ? 0 : null;
      return PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
    case 'dueDate':
      if (!a.dueDate || !b.dueDate) return a.dueDate === b.dueDate ? 0 : null;
      return `${a.dueDate} ${a.dueTime ?? '99'}`.localeCompare(`${b.dueDate} ${b.dueTime ?? '99'}`);
    case 'notes':
      if (!a.notes || !b.notes) return a.notes === b.notes ? 0 : null;
      return a.notes.localeCompare(b.notes);
    case 'name':
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  }
}

/**
 * `mode="active"`: tasks with Status ≠ Done, Due Date ascending.
 * `mode="all"`: every task, Task Name descending.
 */
export const TableView = memo(function TableView({ tasks, mode }: { tasks: Task[]; mode: 'active' | 'all' }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { updateTask, deleteTask, deleteTasks } = useData();
  const { openTask, confirm } = useUi();
  const [sort, setSort] = useState<Sort>(mode === 'active' ? { key: 'dueDate', dir: 'asc' } : { key: 'name', dir: 'desc' });
  const selectable = mode === 'all';
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClicked = useRef<number | null>(null);

  const rows = useMemo(() => {
    const list = mode === 'active' ? tasks.filter((x) => x.status !== 'done') : [...tasks];
    return list.sort((a, b) => {
      const c = compare(a, b, sort.key);
      // Empty values always go last, whatever the direction.
      if (c === null) return isEmpty(a, sort.key) ? 1 : -1;
      return (sort.dir === 'asc' ? c : -c) || a.position - b.position;
    });
  }, [tasks, mode, sort]);

  // Keep only rows that are still listed (deleted or filtered out tasks drop from the selection).
  useEffect(() => {
    setSelected((sel) => {
      const visible = new Set(rows.map((x) => x.id));
      const kept = [...sel].filter((id) => visible.has(id));
      return kept.length === sel.size ? sel : new Set(kept);
    });
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((x) => selected.has(x.id));

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const toggleRow = useCallback((id: number, shift: boolean) => {
    const list = rowsRef.current;
    // Shift+click selects/deselects the whole range since the last clicked row.
    const from = shift && lastClicked.current != null ? list.findIndex((x) => x.id === lastClicked.current) : -1;
    const to = list.findIndex((x) => x.id === id);
    const range = from >= 0 ? list.slice(Math.min(from, to), Math.max(from, to) + 1) : [list[to]];
    lastClicked.current = id;
    setSelected((sel) => {
      const next = new Set(sel);
      const on = !sel.has(id);
      for (const x of range) (on ? next.add(x.id) : next.delete(x.id));
      return next;
    });
  }, []);

  const deleteSelected = useCallback(async () => {
    const ids = rows.filter((x) => selected.has(x.id)).map((x) => x.id);
    if (!ids.length) return;
    const message =
      ids.length === 1
        ? t('task.confirmDelete', { name: rows.find((x) => x.id === ids[0])!.name })
        : t('selection.confirmDelete', { count: ids.length });
    if (await confirm(message)) {
      await deleteTasks(ids);
      setSelected(new Set());
    }
  }, [rows, selected, confirm, deleteTasks, t]);

  // Shortcuts (Default view): Cmd/Ctrl+A selects all, Delete/Backspace deletes, Escape clears.
  useEffect(() => {
    if (!selectable) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setSelected(new Set(rows.map((x) => x.id)));
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size) {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === 'Escape' && selected.size) {
        setSelected(new Set());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectable, rows, selected, deleteSelected]);

  const toggleSort = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const remove = useCallback(
    async (task: Task) => {
      if (await confirm(t('task.confirmDelete', { name: task.name }))) deleteTask(task.id);
    },
    [confirm, deleteTask, t],
  );

  // Large lists only render the rows near the viewport (page scroll), keeping view switches/sorts fast.
  const virtual = rows.length > VIRTUALIZE_ABOVE;
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (tbodyRef.current) setScrollMargin(tbodyRef.current.getBoundingClientRect().top + window.scrollY);
  }, [virtual, selectable]);
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
    enabled: virtual,
  });
  const items = virtual ? virtualizer.getVirtualItems() : null;
  const padTop = items?.length ? items[0].start - scrollMargin : 0;
  const padBottom = items?.length ? virtualizer.getTotalSize() - (items[items.length - 1].end - scrollMargin) : 0;
  const shown = items ? items.map((v) => rows[v.index]) : rows;
  const colSpan = COLUMNS.length + (selectable ? 2 : 1);

  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  return (
    <div className="px-4 pb-6 sm:px-6">
      {selectable && (
        <div className="mb-2 flex min-h-[36px] flex-wrap items-center gap-2 text-sm">
          <button
            className="btn btn-ghost-danger border-line"
            disabled={!selected.size}
            onClick={deleteSelected}
            title={t('selection.deleteHint')}
          >
            🗑 {t('selection.delete')}
            {selected.size > 0 && ` (${selected.size})`}
          </button>
          {selected.size > 0 ? (
            <>
              <span className="text-muted">{t('selection.count', { count: selected.size })}</span>
              <button className="btn-text" onClick={() => setSelected(new Set())}>
                {t('selection.clear')}
              </button>
            </>
          ) : (
            <span className="text-xs text-muted">{t('selection.hint', { mod })}</span>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-panel text-left text-xs text-muted">
              {selectable && (
                <th className="w-9 px-3">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={selected.size > 0 && !allSelected}
                    label={t('selection.all')}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((x) => x.id)))}
                  />
                </th>
              )}
              {COLUMNS.map((k) => (
                <th key={k} className="p-0 font-medium" aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  <button
                    className="flex w-full items-center gap-1 px-3 py-2 hover:bg-hover hover:text-fg"
                    onClick={() => toggleSort(k)}
                    title={t('table.sortBy', { field: t(`fields.${k}`) })}
                  >
                    {t(`fields.${k}`)}
                    {sort.key === k && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </th>
              ))}
              <th className="w-10" aria-label={t('table.actions')} />
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {padTop > 0 && (
              <tr aria-hidden="true" style={{ height: padTop }}>
                <td colSpan={colSpan} />
              </tr>
            )}
            {shown.map((x, i) => (
              <TableRow
                key={x.id}
                task={x}
                lang={lang}
                selectable={selectable}
                isSel={selected.has(x.id)}
                index={items ? items[i].index : i}
                measureRef={virtual ? virtualizer.measureElement : undefined}
                onToggle={toggleRow}
                onRemove={remove}
                onUpdate={updateTask}
                onOpen={openTask}
              />
            ))}
            {padBottom > 0 && (
              <tr aria-hidden="true" style={{ height: padBottom }}>
                <td colSpan={colSpan} />
              </tr>
            )}
            {!rows.length && (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-muted">
                  {t('table.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">{t('table.count', { count: rows.length })}</p>
    </div>
  );
});

interface RowProps {
  task: Task;
  lang: Lang;
  selectable: boolean;
  isSel: boolean;
  index: number;
  measureRef?: (el: Element | null) => void;
  onToggle: (id: number, shift: boolean) => void;
  onRemove: (task: Task) => void;
  onUpdate: (id: number, input: TaskInput) => unknown;
  onOpen: (task: Task) => void;
}

/** Memoized: re-renders only when its task, selection or language changes. */
const TableRow = memo(function TableRow({
  task: x,
  lang,
  selectable,
  isSel,
  index,
  measureRef,
  onToggle,
  onRemove,
  onUpdate: updateTask,
  onOpen: openTask,
}: RowProps) {
  const { t } = useTranslation();
  const now = useNow();
  const cell = (x: Task, key: Key) => {
    switch (key) {
      case 'status':
        return (
          <td key={key} className="px-2 py-1.5">
            <InlineSelect
              value={x.status}
              color={STATUS_COLORS[x.status]}
              label={t('fields.status')}
              options={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))}
              onChange={(v) => updateTask(x.id, { status: v as Status })}
            />
          </td>
        );
      case 'priority':
        return (
          <td key={key} className="px-2 py-1.5">
            <InlineSelect
              value={x.priority ?? ''}
              color={x.priority ? PRIORITY_COLORS[x.priority] : undefined}
              label={t('fields.priority')}
              options={[
                { value: '', label: t('common.none') },
                ...PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) })),
              ]}
              onChange={(v) => updateTask(x.id, { priority: (v || null) as Priority | null })}
            />
          </td>
        );
      case 'name':
        return (
          <td key={key} className="max-w-md px-3 py-1.5">
            <button
              className={`text-left font-medium [overflow-wrap:anywhere] hover:underline ${x.status === 'done' ? 'text-muted line-through' : ''}`}
              onClick={() => openTask(x)}
              title={t('task.edit')}
            >
              {x.name}
            </button>
            <StageProgress stages={x.stages} className="mt-1 max-w-[220px]" />
          </td>
        );
      case 'notes':
        return (
          <td key={key} className="max-w-[320px] truncate px-3 py-1.5 text-muted" title={x.notes}>
            {x.notes}
          </td>
        );
      case 'dueDate': {
        const overdue = isOverdue(x, now);
        return (
          <td key={key} className={`whitespace-nowrap px-3 py-1.5 ${overdue ? 'font-semibold text-danger' : ''}`}>
            {overdue && '⚠️ '}
            {formatDue(x, lang)}
          </td>
        );
      }
    }
  };

  return (
    <tr
      ref={measureRef}
      data-index={index}
      aria-selected={selectable ? isSel : undefined}
      className={`group border-b border-line last:border-b-0 ${isSel ? 'bg-accent/10' : 'hover:bg-hover/50'}`}
    >
      {selectable && (
        <td className="px-3 py-1.5">
          <Checkbox checked={isSel} label={t('selection.row', { name: x.name })} onChange={(shift) => onToggle(x.id, shift)} />
        </td>
      )}
      {COLUMNS.map((k) => cell(x, k))}
      <td className="px-2 py-1.5 text-right">
        <button
          className="btn-icon opacity-0 focus:opacity-100 group-hover:opacity-100"
          onClick={() => onRemove(x)}
          title={t('common.delete')}
          aria-label={t('common.delete')}
        >
          🗑
        </button>
      </td>
    </tr>
  );
});

function Checkbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: (shift: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="h-4 w-4 cursor-pointer accent-[rgb(var(--accent))]"
      aria-label={label}
      title={label}
      checked={checked}
      onChange={() => {}}
      onClick={(e) => {
        onChange(e.shiftKey);
        // The shortcuts listen on window; keep focus off the checkbox so Delete/⌘A keep working.
        e.currentTarget.blur();
      }}
    />
  );
}

function isEmpty(x: Task, key: Key): boolean {
  switch (key) {
    case 'priority':
      return !x.priority;
    case 'dueDate':
      return !x.dueDate;
    case 'notes':
      return !x.notes;
    default:
      return false;
  }
}

function InlineSelect({
  value,
  options,
  onChange,
  color,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  color?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full cursor-pointer appearance-none rounded border-0 px-1.5 py-0.5 text-xs font-medium outline-none hover:ring-1 hover:ring-line focus:ring-1 focus:ring-accent ${color ? 'tint' : 'bg-transparent'}`}
      style={color ? { ['--tint' as string]: color } : undefined}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface text-fg">
          {o.label}
        </option>
      ))}
    </select>
  );
}
