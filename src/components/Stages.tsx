import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MAX_STAGES, MAX_STAGE_TITLE, type Stage } from '../lib/types';

/** "done/total" bar shown on Board cards and table rows; nothing when the task has no stages. */
export function StageProgress({ stages, className = '' }: { stages: Stage[]; className?: string }) {
  const { t } = useTranslation();
  if (!stages.length) return null;
  const done = stages.filter((s) => s.done).length;
  const label = t('stages.progress', { done, total: stages.length });
  return (
    <div className={`flex items-center gap-2 ${className}`} title={label} aria-label={label} role="img">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full ${done === stages.length ? 'bg-[#0F7B6C]' : 'bg-accent'}`}
          style={{ width: `${(done / stages.length) * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted">
        {done}/{stages.length}
      </span>
    </div>
  );
}

export interface StageItem {
  id: number;
  title: string;
  done: boolean;
}

/**
 * Checklist editor: add, rename inline, mark, delete, reorder (drag the ⠿ handle or use the keyboard).
 * `onToggle` is omitted for a task that doesn't exist yet (its stages can't be done).
 */
export function StageEditor({
  items,
  onAdd,
  onRename,
  onToggle,
  onDelete,
  onReorder,
}: {
  items: StageItem[];
  onAdd: (title: string) => void;
  onRename: (id: number, title: string) => void;
  onToggle?: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
  onReorder: (ids: number[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const full = items.length >= MAX_STAGES;

  const add = () => {
    const title = draft.trim();
    if (!title || full) return;
    onAdd(title);
    setDraft('');
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = items.map((s) => s.id);
    onReorder(arrayMove(ids, ids.indexOf(active.id as number), ids.indexOf(over.id as number)));
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <span className="field-label">{t('stages.title')}</span>
        <StageProgress stages={items.map((s, i) => ({ ...s, position: i, completedAt: null }))} className="max-w-[200px] flex-1" />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {items.map((s) => (
              <StageRow key={s.id} stage={s} onRename={onRename} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="mt-1.5 flex gap-2">
        <input
          className="input flex-1"
          placeholder={full ? t('stages.full') : t('stages.addPlaceholder')}
          aria-label={t('stages.addPlaceholder')}
          maxLength={MAX_STAGE_TITLE}
          disabled={full}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={!draft.trim() || full}>
          {t('common.add')}
        </button>
      </div>
    </div>
  );
}

function StageRow({
  stage,
  onRename,
  onToggle,
  onDelete,
}: {
  stage: StageItem;
  onRename: (id: number, title: string) => void;
  onToggle?: (id: number, done: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const [title, setTitle] = useState(stage.title);
  useEffect(() => setTitle(stage.title), [stage.title]);
  const cancelled = useRef(false);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const v = title.trim();
    if (!v) setTitle(stage.title);
    else if (v !== stage.title) onRename(stage.id, v);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-hover ${isDragging ? 'relative z-10 bg-surface shadow-pop' : ''}`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted opacity-50 hover:opacity-100"
        title={t('stages.drag')}
        aria-label={t('stages.drag')}
      >
        ⠿
      </button>
      {onToggle && (
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))]"
          checked={stage.done}
          aria-label={t('stages.toggle', { title: stage.title })}
          onChange={(e) => onToggle(stage.id, e.target.checked)}
        />
      )}
      <input
        className={`min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-line focus:border-accent ${
          stage.done ? 'text-muted line-through' : ''
        }`}
        aria-label={t('stages.rename')}
        maxLength={MAX_STAGE_TITLE}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            // Revert this edit only; don't close the task modal.
            e.stopPropagation();
            cancelled.current = true;
            setTitle(stage.title);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="btn-icon h-7 w-7 opacity-0 focus:opacity-100 group-hover:opacity-100"
        title={t('stages.delete')}
        aria-label={t('stages.delete')}
        onClick={() => onDelete(stage.id)}
      >
        ✕
      </button>
    </li>
  );
}
