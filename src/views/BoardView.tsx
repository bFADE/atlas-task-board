import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { STATUSES, STATUS_COLORS, type Status, type Task } from '../lib/types';
import { formatDue, isOverdue } from '../lib/dates';
import { useData, useLang, useUi } from '../store';
import { CategoryTags, PriorityBadge } from '../components/Badges';

type Columns = Record<Status, number[]>;

const HANDLE = '[data-column-handle]';

/**
 * One pointer sensor for the whole board (dnd-kit merges listeners per event name, so two pointer
 * sensors would override each other). Column drags start only from the ⠿ handle (the only element
 * with column listeners) and need a longer movement, so columns don't get moved by accident.
 */
class BoardPointerSensor extends PointerSensor {
  constructor(props: ConstructorParameters<typeof PointerSensor>[0]) {
    const onHandle = !!(props.event.target as Element | null)?.closest?.(HANDLE);
    super({ ...props, options: { ...props.options, activationConstraint: { distance: onHandle ? 12 : 5 } } });
  }
}
/** Droppable list area of a column (cards are dropped here). */
const colId = (s: Status) => `col:${s}`;
/** Sortable column itself (dragged by its header to reorder the board). */
const COLUMN = 'column:';
const columnId = (s: Status) => `${COLUMN}${s}`;
const isColumn = (id: UniqueIdentifier) => String(id).startsWith(COLUMN);

const isList = (id: UniqueIdentifier) => String(id).startsWith('col:');

/**
 * Columns only collide with columns. For cards, the column under the pointer wins first, so a drop
 * in the empty lower part of a column lands in that column (not a neighbour whose cards are closer).
 */
const collision: CollisionDetection = (args) => {
  const { active, droppableContainers, pointerCoordinates } = args;
  if (isColumn(active.id)) {
    return closestCenter({ ...args, droppableContainers: droppableContainers.filter((c) => isColumn(c.id)) });
  }
  const lists = droppableContainers.filter((c) => isList(c.id));
  const [list] = pointerWithin({ ...args, droppableContainers: lists });
  if (!list) return rectIntersection({ ...args, droppableContainers: lists });

  const cards = droppableContainers.filter(
    (c) => !isList(c.id) && !isColumn(c.id) && c.data.current?.sortable?.containerId === list.id,
  );
  const lastBottom = Math.max(...cards.map((c) => c.rect.current?.bottom ?? -Infinity));
  // Below the last card (or an empty column): target the list itself, i.e. append at the end.
  if (!cards.length || !pointerCoordinates || pointerCoordinates.y > lastBottom) return [list];
  return closestCenter({ ...args, droppableContainers: cards });
};

export const BoardView = memo(function BoardView({ tasks, statuses }: { tasks: Task[]; statuses: Status[] }) {
  const { t } = useTranslation();
  const { updateTask, boardColumns, saveBoardColumns, notify } = useData();
  const taskMap = useMemo(() => new Map(tasks.map((x) => [x.id, x])), [tasks]);
  const visible = statuses.length ? boardColumns.filter((s) => statuses.includes(s)) : boardColumns;
  const [activeColumn, setActiveColumn] = useState<Status | null>(null);

  const grouped = useMemo(() => {
    const cols = Object.fromEntries(STATUSES.map((s) => [s, [] as number[]])) as Columns;
    for (const x of [...tasks].sort((a, b) => a.position - b.position)) cols[x.status].push(x.id);
    return cols;
  }, [tasks]);

  // While dragging, a local copy of the columns is rearranged live; it is committed on drop.
  const [dragCols, setDragCols] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const cols = dragCols ?? grouped;

  const sensors = useSensors(
    useSensor(BoardPointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findCol = (c: Columns, id: UniqueIdentifier): Status | undefined => {
    if (typeof id === 'string' && id.startsWith('col:')) return id.slice(4) as Status;
    return STATUSES.find((s) => c[s].includes(id as number));
  };

  const onDragStart = (e: DragStartEvent) => {
    if (isColumn(e.active.id)) {
      setActiveColumn(String(e.active.id).slice(COLUMN.length) as Status);
      return;
    }
    setActiveId(e.active.id as number);
    setDragCols(grouped);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragCols || isColumn(active.id)) return;
    const from = findCol(dragCols, active.id);
    const to = findCol(dragCols, over.id);
    if (!from || !to || from === to) return;
    setDragCols((c) => {
      if (!c) return c;
      const target = c[to];
      const overIndex = target.indexOf(over.id as number);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...c,
        [from]: c[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), active.id as number, ...target.slice(index)],
      };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (isColumn(active.id)) {
      setActiveColumn(null);
      if (!over || over.id === active.id) return;
      const from = boardColumns.indexOf(String(active.id).slice(COLUMN.length) as Status);
      const to = boardColumns.indexOf(String(over.id).slice(COLUMN.length) as Status);
      if (from >= 0 && to >= 0) {
        const previous = boardColumns;
        saveBoardColumns(arrayMove(boardColumns, from, to));
        notify(t('board.columnsMoved'), 'info', { label: t('common.undo'), run: () => saveBoardColumns(previous) });
      }
      return;
    }
    const c = dragCols;
    setDragCols(null);
    setActiveId(null);
    if (!over || !c) return;
    const id = active.id as number;
    const col = findCol(c, id);
    if (!col) return;
    let list = c[col];
    const overIndex = list.indexOf(over.id as number);
    if (overIndex >= 0) list = arrayMove(list, list.indexOf(id), overIndex);

    // Fractional position between the new neighbours, so hidden (filtered) tasks keep their order.
    const i = list.indexOf(id);
    const prev = taskMap.get(list[i - 1]);
    const next = taskMap.get(list[i + 1]);
    const position =
      prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;

    const task = taskMap.get(id)!;
    const sameOrder = grouped[col].join() === list.join();
    if (task.status !== col || !sameOrder) updateTask(id, { status: col, position });
  };

  const activeTask = activeId != null ? taskMap.get(activeId) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragCols(null);
        setActiveId(null);
        setActiveColumn(null);
      }}
    >
      <SortableContext items={visible.map(columnId)} strategy={horizontalListSortingStrategy}>
        <div className="flex gap-3 overflow-x-auto px-4 pb-6 sm:px-6">
          {visible.map((s) => (
            <Column key={s} status={s} ids={cols[s]} taskMap={taskMap} />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeTask && <Card task={activeTask} overlay />}
        {activeColumn && <ColumnHeader status={activeColumn} count={cols[activeColumn].length} overlay />}
      </DragOverlay>
    </DndContext>
  );
});

const Column = memo(function Column({ status, ids, taskMap }: { status: Status; ids: number[]; taskMap: Map<number, Task> }) {
  const { t } = useTranslation();
  const { openTask } = useUi();
  const { setNodeRef, isOver } = useDroppable({ id: colId(status) });
  const sortable = useSortable({ id: columnId(status) });

  return (
    <section
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      className={`flex min-w-[16rem] flex-1 basis-0 flex-col rounded-lg bg-panel ${sortable.isDragging ? 'opacity-40' : ''}`}
      aria-label={t(`status.${status}`)}
    >
      <ColumnHeader
        status={status}
        count={ids.length}
        handleRef={sortable.setActivatorNodeRef}
        handle={{ ...sortable.attributes, ...sortable.listeners }}
      />
      <SortableContext id={colId(status)} items={ids} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-[60px] flex-1 flex-col gap-2 rounded-md p-2 transition ${isOver ? 'bg-hover' : ''}`}
        >
          {ids.map((id) => {
            const task = taskMap.get(id);
            return task ? <SortableCard key={id} task={task} /> : null;
          })}
        </div>
      </SortableContext>
      <button
        className="mx-2 mb-2 rounded-md px-2 py-1.5 text-left text-sm text-muted hover:bg-hover hover:text-fg"
        onClick={() => openTask(null, { status })}
      >
        + {t('task.newShort')}
      </button>
    </section>
  );
});

function ColumnHeader({
  status,
  count,
  handle,
  handleRef,
  overlay,
}: {
  status: Status;
  count: number;
  handle?: object;
  handleRef?: (el: HTMLElement | null) => void;
  overlay?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <header
      className={`group/h flex items-center gap-2 rounded-t-lg px-3 pb-1 pt-3 ${
        overlay ? 'w-64 rounded-lg bg-panel pb-3 shadow-pop' : ''
      }`}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
      <h2 className="text-sm font-semibold">{t(`status.${status}`)}</h2>
      <span className="text-xs text-muted">{count}</span>
      <button
        type="button"
        ref={handleRef}
        data-column-handle
        {...handle}
        title={t('board.dragColumn')}
        aria-label={t('board.dragColumn')}
        className="ml-auto flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded text-muted opacity-40 transition hover:bg-hover hover:text-fg focus:opacity-100 active:cursor-grabbing group-hover/h:opacity-100"
      >
        ⠿
      </button>
    </header>
  );
}

const SortableCard = memo(function SortableCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
      {...attributes}
      {...listeners}
    >
      <Card task={task} />
    </div>
  );
});

const Card = memo(function Card({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { categoryMap } = useData();
  const { openTask } = useUi();
  const overdue = isOverdue(task);

  return (
    <article
      onClick={() => openTask(task)}
      className={`cursor-pointer space-y-1.5 rounded-md border p-2.5 text-sm transition hover:shadow-card ${
        overdue ? 'border-danger/60 bg-danger/10' : 'border-line bg-surface'
      } ${overlay ? 'rotate-2 shadow-pop' : ''}`}
      title={overdue ? t('task.overdue') : undefined}
    >
      <p className={`font-medium leading-snug ${task.status === 'done' ? 'text-muted line-through' : ''}`}>{task.name}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className={`text-xs ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}>
            {overdue ? '⚠️' : '🗓'} {formatDue(task, lang)}
          </span>
        )}
      </div>
      <CategoryTags ids={task.categoryIds} map={categoryMap} />
    </article>
  );
});
