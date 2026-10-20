import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDate, formatTimeInput } from '../lib/dates';
import {
  APPOINTMENT_STATUSES,
  MAX_APPOINTMENT_TITLE,
  MAX_LOCATION,
  type Appointment,
  type AppointmentStatus,
} from '../lib/types';
import { useData, useLang, useUi } from '../store';
import { DateInput } from './DateInput';
import { TimeInput } from './TimeInput';
import { Pill } from './Badges';

interface Form {
  title: string;
  categoryId: number | null;
  startDate: string | null;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  location: string;
}

const EMPTY: Form = { title: '', categoryId: null, startDate: null, startTime: null, endDate: null, endTime: null, location: '' };

/**
 * Phase 1 test list for appointments (the calendar views come in phase 2):
 * create, edit, change status and delete through the API.
 */
export function AppointmentsSection() {
  const { t } = useTranslation();
  const lang = useLang();
  const { categories, categoryMap, reportError } = useData();
  const { confirm } = useUi();
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [incomplete, setIncomplete] = useState(false);

  const load = () => api.listAppointments().then(setItems).catch(reportError);
  useEffect(() => {
    load();
  }, []); // load once when Settings opens

  const when = (a: Appointment) => {
    const [sd, st] = a.start.split('T');
    const [ed, et] = a.end.split('T');
    const start = `${formatDate(sd, lang)} ${formatTimeInput(st, lang)}`;
    return sd === ed ? `${start}–${formatTimeInput(et, lang)}` : `${start} – ${formatDate(ed, lang)} ${formatTimeInput(et, lang)}`;
  };

  const submit = async () => {
    const { title, startDate, startTime, endDate, endTime } = form;
    if (!title.trim() || !startDate || !startTime || !endTime) {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    const body = {
      title: title.trim(),
      categoryId: form.categoryId,
      start: `${startDate}T${startTime}`,
      end: `${endDate ?? startDate}T${endTime}`,
      location: form.location,
    };
    try {
      if (editing) await api.updateAppointment(editing, body);
      else await api.createAppointment(body);
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) {
      reportError(err); // e.g. "The end must be after the start." — the form keeps what was typed
    }
  };

  const edit = (a: Appointment) => {
    const [sd, st] = a.start.split('T');
    const [ed, et] = a.end.split('T');
    setEditing(a.id);
    setForm({ title: a.title, categoryId: a.categoryId, startDate: sd, startTime: st, endDate: ed, endTime: et, location: a.location });
  };

  const setStatus = async (a: Appointment, status: AppointmentStatus) => {
    try {
      await api.updateAppointment(a.id, { status });
      load();
    } catch (err) {
      reportError(err);
    }
  };

  const remove = async (a: Appointment) => {
    if (!(await confirm(t('appointments.confirmDelete', { title: a.title })))) return;
    try {
      await api.deleteAppointment(a.id);
      if (editing === a.id) {
        setEditing(null);
        setForm(EMPTY);
      }
      load();
    } catch (err) {
      reportError(err);
    }
  };

  return (
    <section>
      <h3 className="section-title">{t('appointments.title')}</h3>
      <p className="mb-3 text-sm text-muted">{t('appointments.help')}</p>

      <ul className="mb-3 divide-y divide-line rounded-md border border-line">
        {items?.map((a) => {
          const cat = a.categoryId != null ? categoryMap.get(a.categoryId) : undefined;
          return (
            <li key={a.id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${editing === a.id ? 'bg-accent/10' : ''}`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium [overflow-wrap:anywhere]">{a.title}</div>
                <div className="text-xs text-muted">
                  {when(a)}
                  {a.location && ` · ${a.location}`}
                </div>
              </div>
              {cat && <Pill color={cat.color}>{cat.name}</Pill>}
              <select
                className="input w-auto py-1 text-xs"
                aria-label={t('appointments.status')}
                value={a.status}
                onChange={(e) => setStatus(a, e.target.value as AppointmentStatus)}
              >
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`appointments.statuses.${s}`)}
                  </option>
                ))}
              </select>
              <button className="btn-icon" title={t('appointments.edit')} aria-label={t('appointments.edit')} onClick={() => edit(a)}>
                ✎
              </button>
              <button className="btn-icon" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => remove(a)}>
                🗑
              </button>
            </li>
          );
        })}
        {items && !items.length && <li className="px-3 py-2 text-sm text-muted">{t('appointments.empty')}</li>}
      </ul>

      <div className="space-y-2 rounded-md border border-line p-3">
        <div className="flex flex-wrap gap-2">
          <input
            className="input min-w-0 flex-1"
            placeholder={t('appointments.titlePlaceholder')}
            aria-label={t('appointments.titlePlaceholder')}
            maxLength={MAX_APPOINTMENT_TITLE}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <select
            className="input w-auto"
            aria-label={t('fields.category')}
            value={form.categoryId ?? ''}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t('appointments.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-start gap-2 text-sm">
          <span className="field-label w-12 pt-2">{t('appointments.start')}</span>
          <DateInput value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
          <TimeInput value={form.startTime} onChange={(v) => setForm({ ...form, startTime: v })} />
        </div>
        <div className="flex flex-wrap items-start gap-2 text-sm">
          <span className="field-label w-12 pt-2">{t('appointments.end')}</span>
          <DateInput value={form.endDate ?? form.startDate} onChange={(v) => setForm({ ...form, endDate: v })} />
          <TimeInput value={form.endTime} onChange={(v) => setForm({ ...form, endTime: v })} />
        </div>
        <input
          className="input"
          placeholder={t('appointments.location')}
          aria-label={t('appointments.location')}
          maxLength={MAX_LOCATION}
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        {incomplete && <p className="text-xs text-danger">{t('appointments.incomplete')}</p>}
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={submit}>
            {editing ? t('common.save') : t('appointments.add')}
          </button>
          {editing && (
            <button
              className="btn"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
