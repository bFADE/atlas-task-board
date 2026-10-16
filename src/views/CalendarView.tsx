import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { PRIORITY_COLORS, STATUS_COLORS, type Task } from '../lib/types';
import {
  formatDate,
  formatTime,
  isOverdue,
  monthYearLabel,
  toDateStr,
  todayStr,
  weekStartOf,
  weekdayNames,
} from '../lib/dates';
import { load, save } from '../lib/storage';
import { useData, useLang, useUi } from '../store';

type Mode = 'month' | 'week';
const MONTH_CELL_LINES = 3;

const STATUS_ICON = { backlog: '📥', todo: '○', in_progress: '🔄', blocked: '🚫', done: '✅' } as const;

export function CalendarView({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { updateTask } = useData();
  const [mode, setMode] = useState<Mode>(() => load<Mode>('calendarMode', 'month'));
  const [cursor, setCursor] = useState(() => new Date());
  const [dragging, setDragging] = useState<Task | null>(null);
  const weekStartsOn = weekStartOf(lang);
  const today = todayStr();

  const setModePersist = (m: Mode) => {
    setMode(m);
    save('calendarMode', m);
  };

  const days = useMemo(() => {
    const start = mode === 'month' ? startOfWeek(startOfMonth(cursor), { weekStartsOn }) : startOfWeek(cursor, { weekStartsOn });
    const end = mode === 'month' ? endOfWeek(endOfMonth(cursor), { weekStartsOn }) : endOfWeek(cursor, { weekStartsOn });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor, mode, weekStartsOn]);

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const x of tasks) {
      if (!x.dueDate) continue;
      if (!m.has(x.dueDate)) m.set(x.dueDate, []);
      m.get(x.dueDate)!.push(x);
    }
    for (const list of m.values()) {
      list.sort((a, b) => (a.dueTime ?? '99').localeCompare(b.dueTime ?? '99') || a.position - b.position);
    }
    return m;
  }, [tasks]);

  const undated = tasks.filter((x) => !x.dueDate).length;

  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'month' ? addMonths(c, dir) : addWeeks(c, dir)));

  const title =
    mode === 'month'
      ? monthYearLabel(cursor, lang)
      : `${formatDate(toDateStr(days[0]), lang)} – ${formatDate(toDateStr(days[6]), lang)}`;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const task = tasks.find((x) => x.id === active.id);
    const date = String(over.id).slice(4);
    if (task && task.dueDate !== date) updateTask(task.id, { dueDate: date, dueTime: task.dueTime });
  };

  return (
    <div className="px-4 pb-6 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn" onClick={() => setCursor(new Date())}>
          {t('calendar.today')}
        </button>
        <button className="btn-icon" onClick={() => step(-1)} title={t('calendar.previous')} aria-label={t('calendar.previous')}>
          ‹
        </button>
        <button className="btn-icon" onClick={() => step(1)} title={t('calendar.next')} aria-label={t('calendar.next')}>
          ›
        </button>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex-1" />
        {undated > 0 && <span className="text-xs text-muted">{t('calendar.undated', { count: undated })}</span>}
        <div className="flex rounded-md border border-line p-0.5 text-sm" role="group">
          {(['month', 'week'] as Mode[]).map((m) => (
            <button
              key={m}
              aria-pressed={mode === m}
              onClick={() => setModePersist(m)}
              className={`rounded px-2.5 py-1 ${mode === m ? 'bg-hover font-semibold' : 'text-muted'}`}
            >
              {t(`calendar.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setDragging(tasks.find((x) => x.id === e.active.id) ?? null)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="overflow-x-auto rounded-lg border border-line">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 border-b border-line bg-panel text-xs font-medium uppercase text-muted">
              {weekdayNames(lang).map((d) => (
                <div key={d} className="px-2 py-1.5">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const ds = toDateStr(d);
                return (
                  <DayCell
                    key={ds}
                    date={ds}
                    dayNumber={d.getDate()}
                    isToday={ds === today}
                    outside={mode === 'month' && !isSameMonth(d, cursor)}
                    tall={mode === 'week'}
                    onMore={() => {
                      setCursor(d);
                      setModePersist('week');
                    }}
                    tasks={byDay.get(ds) ?? []}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <DragOverlay>{dragging && <Item task={dragging} overlay />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function DayCell({
  date,
  dayNumber,
  isToday,
  outside,
  tall,
  tasks,
  onMore,
}: {
  date: string;
  dayNumber: number;
  isToday: boolean;
  outside: boolean;
  tall: boolean;
  onMore: () => void;
  tasks: Task[];
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const { openTask } = useUi();
  // Month cells keep a fixed height: at most 3 lines, the last one becomes "+N more" when needed.
  const visible = tall || tasks.length <= MONTH_CELL_LINES ? tasks : tasks.slice(0, MONTH_CELL_LINES - 1);
  const hidden = tasks.length - visible.length;
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });

  return (
    <div
      ref={setNodeRef}
      onClick={() => openTask(null, { dueDate: date })}
      title={t('calendar.addOn', { date: formatDate(date, lang) })}
      className={`group cursor-pointer border-b border-r border-line p-1 transition [&:nth-child(7n)]:border-r-0 ${
        tall ? 'min-h-[60vh]' : 'min-h-[110px]'
      } ${outside ? 'bg-panel/60' : ''} ${isOver ? 'bg-accent/10' : 'hover:bg-hover/50'}`}
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span
          className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${
            isToday ? 'bg-danger font-bold text-white' : outside ? 'text-muted/60' : 'text-muted'
          }`}
        >
          {dayNumber}
        </span>
        <span className="text-xs text-muted opacity-0 group-hover:opacity-100">+</span>
      </div>
      <div className="space-y-1">
        {visible.map((x) => (
          <DraggableItem key={x.id} task={x} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className="w-full rounded px-1.5 py-0.5 text-left text-xs font-medium text-muted hover:bg-hover hover:text-fg"
            title={t('calendar.showDay')}
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
          >
            {t('calendar.more', { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}

function DraggableItem({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? 'opacity-30' : ''}>
      <Item task={task} />
    </div>
  );
}

function Item({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { openTask } = useUi();
  const overdue = isOverdue(task);
  const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : 'transparent';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        openTask(task);
      }}
      title={[
        task.name,
        t(`status.${task.status}`),
        task.priority ? t(`priority.${task.priority}`) : '',
        overdue ? t('task.overdue') : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      className={`flex cursor-pointer items-center gap-1 truncate rounded border-l-[3px] px-1.5 py-0.5 text-xs ${
        overlay ? 'shadow-pop' : ''
      } ${overdue ? 'text-danger' : ''} ${task.status === 'done' ? 'line-through opacity-60' : ''}`}
      style={{ borderLeftColor: priorityColor, backgroundColor: `${STATUS_COLORS[task.status]}22` }}
    >
      <span className="shrink-0 text-[10px]">{STATUS_ICON[task.status]}</span>
      {task.dueTime && <span className="shrink-0 text-muted">{formatTime(task.dueTime, lang)}</span>}
      <span className="truncate font-medium">{task.name}</span>
    </div>
  );
}
