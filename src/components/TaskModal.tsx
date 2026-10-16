import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_PALETTE, MAX_NAME, MAX_NOTES, PRIORITIES, STATUSES, type Priority, type Status, type TaskInput } from '../lib/types';
import { formatDateTime } from '../lib/dates';
import { useData, useLang, useUi } from '../store';
import { Modal } from './Modal';
import { DateInput } from './DateInput';
import { Pill } from './Badges';

export function TaskModal() {
  const { taskModal } = useUi();
  if (!taskModal) return null;
  // Keyed so the form state resets for each task opened.
  return <TaskForm key={taskModal.task?.id ?? 'new'} />;
}

function TaskForm() {
  const { t } = useTranslation();
  const lang = useLang();
  const { taskModal, closeTask, confirm } = useUi();
  const { categories, createTask, updateTask, deleteTask, createCategory } = useData();
  const task = taskModal!.task;
  const init = { ...taskModal!.defaults, ...task };

  const [name, setName] = useState(init.name ?? '');
  const [status, setStatus] = useState<Status>(init.status ?? 'todo');
  const [priority, setPriority] = useState<Priority | null>(init.priority ?? null);
  const [dueDate, setDueDate] = useState<string | null>(init.dueDate ?? null);
  const [dueTime, setDueTime] = useState<string | null>(init.dueTime ?? null);
  const [categoryIds, setCategoryIds] = useState<number[]>(init.categoryIds ?? []);
  const [notes, setNotes] = useState(init.notes ?? '');
  const [newCat, setNewCat] = useState('');
  const [nameError, setNameError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const toggleCat = (id: number) =>
    setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const addCategory = async () => {
    const n = newCat.trim();
    if (!n) return;
    const existing = categories.find((c) => c.name.toLowerCase() === n.toLowerCase());
    if (existing) {
      if (!categoryIds.includes(existing.id)) toggleCat(existing.id);
    } else {
      const c = await createCategory(n, CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length]);
      if (c) setCategoryIds((ids) => [...ids, c.id]);
    }
    setNewCat('');
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    setSaveFailed(false);
    const payload: TaskInput = {
      name: name.trim(),
      status,
      priority,
      dueDate,
      dueTime: dueDate ? dueTime || null : null,
      categoryIds,
      notes,
    };
    // Only close once the server has the data; on failure the form keeps everything typed.
    const ok = task ? await updateTask(task.id, payload) : !!(await createTask(payload));
    setSaving(false);
    if (ok) closeTask();
    else setSaveFailed(true);
  };

  const remove = async () => {
    if (!task) return;
    if (await confirm(t('task.confirmDelete', { name: task.name }))) {
      await deleteTask(task.id);
      closeTask();
    }
  };

  return (
    <Modal
      title={task ? t('task.edit') : t('task.new')}
      onClose={closeTask}
      footer={
        <>
          {task && (
            <button type="button" className="btn btn-ghost-danger" onClick={remove}>
              🗑 {t('common.delete')}
            </button>
          )}
          <div className="flex-1" />
          <button type="button" className="btn" onClick={closeTask}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={saving}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <form
        id="task-form"
        onSubmit={submit}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && submit()}
        className="space-y-4"
      >
        <div>
          <input
            autoFocus
            className={`w-full border-0 bg-transparent px-0 text-2xl font-bold outline-none placeholder:text-muted/60 ${
              nameError ? 'placeholder:text-danger' : ''
            }`}
            placeholder={t('fields.namePlaceholder')}
            aria-label={t('fields.name')}
            maxLength={MAX_NAME}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
          />
          {nameError && <p className="text-xs text-danger">{t('task.nameRequired')}</p>}
          {saveFailed && (
            <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {t('task.saveFailed')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-[7.5rem_1fr] items-center gap-x-3 gap-y-3 text-sm">
          <label className="field-label" htmlFor="f-status">
            {t('fields.status')}
          </label>
          <select id="f-status" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="f-priority">
            {t('fields.priority')}
          </label>
          <select
            id="f-priority"
            className="input"
            value={priority ?? ''}
            onChange={(e) => setPriority((e.target.value || null) as Priority | null)}
          >
            <option value="">{t('common.none')}</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="f-due">
            {t('fields.dueDate')}
          </label>
          <div className="flex flex-wrap items-start gap-2">
            <DateInput id="f-due" value={dueDate} onChange={setDueDate} />
            <input
              type="time"
              className="input w-32"
              aria-label={t('fields.dueTime')}
              title={t('fields.dueTime')}
              disabled={!dueDate}
              value={dueTime ?? ''}
              onChange={(e) => setDueTime(e.target.value || null)}
            />
            {dueDate && (
              <button
                type="button"
                className="btn-icon mt-1"
                title={t('task.clearDate')}
                aria-label={t('task.clearDate')}
                onClick={() => {
                  setDueDate(null);
                  setDueTime(null);
                }}
              >
                ✕
              </button>
            )}
          </div>

          <span className="field-label self-start pt-1">{t('fields.category')}</span>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const on = categoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleCat(c.id)}
                    className={`rounded transition ${on ? 'ring-2 ring-offset-1 ring-offset-surface' : 'opacity-50 hover:opacity-100'}`}
                    style={{ ['--tw-ring-color' as string]: c.color }}
                  >
                    <Pill color={c.color}>{c.name}</Pill>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t('category.newPlaceholder')}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
              />
              <button type="button" className="btn" onClick={addCategory} disabled={!newCat.trim()}>
                {t('common.add')}
              </button>
            </div>
          </div>

          {task && (
            <>
              <span className="field-label">{t('fields.created')}</span>
              <span className="text-muted">{formatDateTime(task.createdAt, lang)}</span>
            </>
          )}
        </div>

        <div>
          <label className="field-label mb-1 block" htmlFor="f-notes">
            {t('fields.notes')}
          </label>
          <textarea
            id="f-notes"
            className="input min-h-[120px] resize-y"
            placeholder={t('fields.notesPlaceholder')}
            maxLength={MAX_NOTES}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
