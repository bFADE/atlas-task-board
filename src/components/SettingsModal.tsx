import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORY_PALETTE, STATUSES, type Category, type PomodoroSettings } from '../lib/types';
import { useData, useUi } from '../store';
import { Modal } from './Modal';
import { Pill } from './Badges';

export function SettingsModal() {
  const { t } = useTranslation();
  const { settingsOpen, setSettingsOpen, confirm } = useUi();
  const { restoreSample, removeSample, tasks, boardColumns, saveBoardColumns } = useData();
  if (!settingsOpen) return null;
  const sampleCount = tasks.filter((x) => x.isSample).length;

  return (
    <Modal title={t('settings.title')} onClose={() => setSettingsOpen(false)} width="max-w-2xl">
      <div className="space-y-8">
        <PomodoroSection />
        <section>
          <h3 className="section-title">{t('settings.boardTitle')}</h3>
          <p className="mb-3 text-sm text-muted">{t('settings.boardHelp')}</p>
          <p className="mb-3 text-sm">{boardColumns.map((s) => t(`status.${s}`)).join('  →  ')}</p>
          <button
            className="btn"
            disabled={boardColumns.join() === STATUSES.join()}
            onClick={() => saveBoardColumns(STATUSES)}
          >
            {t('settings.resetColumns')}
          </button>
        </section>
        <CategorySection />
        <section>
          <h3 className="section-title">{t('settings.sampleTitle')}</h3>
          <p className="mb-3 text-sm text-muted">{t('settings.sampleHelp', { count: sampleCount })}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost-danger"
              disabled={!sampleCount}
              onClick={async () => {
                if (await confirm(t('settings.confirmRemoveSample', { count: sampleCount }), t('settings.removeSample'))) {
                  removeSample();
                }
              }}
            >
              {t('settings.removeSample')}
            </button>
            <button className="btn" onClick={restoreSample}>
              {t('settings.restoreSample')}
            </button>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function PomodoroSection() {
  const { t } = useTranslation();
  const { pomodoroSettings, savePomodoroSettings, notify } = useData();
  const [draft, setDraft] = useState<PomodoroSettings>(pomodoroSettings);
  useEffect(() => setDraft(pomodoroSettings), [pomodoroSettings]);

  const fields: (keyof Omit<PomodoroSettings, 'autoCycle'>)[] = ['pomodoro', 'short', 'long', 'custom'];
  const valid = fields.every((f) => Number.isInteger(draft[f]) && draft[f] >= 1 && draft[f] <= 600);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pomodoroSettings);

  return (
    <section>
      <h3 className="section-title">{t('settings.pomodoroTitle')}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {fields.map((f) => (
          <label key={f} className="text-sm">
            <span className="field-label mb-1 block">{t(`pomodoro.modes.${f}`)}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={600}
                className="input"
                value={Number.isNaN(draft[f]) ? '' : draft[f]}
                onChange={(e) => setDraft({ ...draft, [f]: e.target.valueAsNumber })}
              />
              <span className="text-muted">{t('pomodoro.min')}</span>
            </div>
          </label>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.autoCycle}
          onChange={(e) => setDraft({ ...draft, autoCycle: e.target.checked })}
        />
        {t('pomodoro.autoCycle')}
      </label>
      {!valid && <p className="mt-2 text-xs text-danger">{t('settings.durationInvalid')}</p>}
      <button
        className="btn btn-primary mt-3"
        disabled={!valid || !dirty}
        onClick={async () => {
          if (await savePomodoroSettings(draft)) notify(t('settings.saved'));
        }}
      >
        {t('common.save')}
      </button>
    </section>
  );
}

function CategorySection() {
  const { t } = useTranslation();
  const { categories, createCategory } = useData();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_PALETTE[5]);

  const add = async () => {
    if (!name.trim()) return;
    if (await createCategory(name.trim(), color)) setName('');
  };

  return (
    <section>
      <h3 className="section-title">{t('settings.categoriesTitle')}</h3>
      <ul className="divide-y divide-line rounded-md border border-line">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
        {!categories.length && <li className="px-3 py-2 text-sm text-muted">{t('category.empty')}</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ColorPicker value={color} onChange={setColor} />
        <input
          className="input min-w-0 flex-1"
          placeholder={t('category.newPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn btn-primary" onClick={add} disabled={!name.trim()}>
          {t('category.add')}
        </button>
      </div>
    </section>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const { t } = useTranslation();
  const { updateCategory, deleteCategory, tasks } = useData();
  const { confirm } = useUi();
  const [name, setName] = useState(category.name);
  useEffect(() => setName(category.name), [category.name]);

  const rename = async () => {
    const n = name.trim();
    if (!n) return setName(category.name);
    if (n !== category.name && !(await updateCategory(category.id, { name: n }))) setName(category.name);
  };

  const remove = async () => {
    const used = tasks.filter((x) => x.categoryIds.includes(category.id)).length;
    if (await confirm(t('category.confirmDelete', { name: category.name, count: used }))) {
      deleteCategory(category.id);
    }
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <ColorPicker value={category.color} onChange={(color) => updateCategory(category.id, { color })} />
      <input
        className="input min-w-0 flex-1"
        aria-label={t('category.rename')}
        title={t('category.rename')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <span className="hidden sm:block">
        <Pill color={category.color}>{name || category.name}</Pill>
      </span>
      <button className="btn-icon" onClick={remove} title={t('category.delete')} aria-label={t('category.delete')}>
        🗑
      </button>
    </li>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="h-7 w-7 rounded-md border border-line"
        style={{ backgroundColor: value }}
        title={t('category.color')}
        aria-label={t('category.color')}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-20 w-44 rounded-md bg-surface p-2 shadow-pop">
            <div className="grid grid-cols-5 gap-1.5">
              {CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`h-6 w-6 rounded ${c.toLowerCase() === value.toLowerCase() ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                />
              ))}
              <label
                className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-dashed border-line text-xs text-muted"
                title={t('category.customColor')}
              >
                +
                <input
                  type="color"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
