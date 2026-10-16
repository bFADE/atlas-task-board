import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, parseLocalDate } from '../lib/dates';
import { useLang } from '../store';

/**
 * Date field that displays and accepts the app language's format (MM/DD/YYYY or DD/MM/YYYY),
 * with a button that opens the browser's native date picker.
 */
export function DateInput({
  value,
  onChange,
  id,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [text, setText] = useState(value ? formatDate(value, lang) : '');
  const [invalid, setInvalid] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(value ? formatDate(value, lang) : '');
    setInvalid(false);
  }, [value, lang]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const parsed = parseLocalDate(text, lang);
    setInvalid(!parsed);
    if (parsed) onChange(parsed);
  };

  return (
    <div className="relative flex-1">
      <input
        id={id}
        className={`input pr-9 ${invalid ? 'border-danger' : ''}`}
        value={text}
        placeholder={t('date.placeholder')}
        aria-invalid={invalid}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <button
        type="button"
        className="btn-icon absolute right-1 top-1/2 -translate-y-1/2"
        title={t('date.pick')}
        aria-label={t('date.pick')}
        onClick={() => {
          try {
            picker.current?.showPicker();
          } catch {
            picker.current?.focus();
          }
        }}
      >
        📅
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {invalid && <p className="mt-1 text-xs text-danger">{t('date.invalid')}</p>}
    </div>
  );
}
