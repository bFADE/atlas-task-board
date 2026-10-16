import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimeInput, parseLocalTime } from '../lib/dates';
import { useLang } from '../store';

/**
 * Time field in the app language's format (24 h "HH:MM" in PT, "h:mm AM/PM" in EN) instead of the
 * native time input, which follows the operating system's locale.
 */
export function TimeInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [text, setText] = useState(value ? formatTimeInput(value, lang) : '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(value ? formatTimeInput(value, lang) : '');
    setInvalid(false);
  }, [value, lang]);

  const commit = () => {
    if (!text.trim()) {
      setInvalid(false);
      onChange(null);
      return;
    }
    const parsed = parseLocalTime(text, lang);
    setInvalid(!parsed);
    if (parsed) {
      onChange(parsed);
      setText(formatTimeInput(parsed, lang));
    }
  };

  return (
    <div className="w-32">
      <input
        className={`input ${invalid ? 'border-danger' : ''}`}
        inputMode="text"
        aria-label={t('fields.dueTime')}
        title={t('fields.dueTime')}
        placeholder={t('time.placeholder')}
        aria-invalid={invalid}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      {invalid && <p className="mt-1 text-xs text-danger">{t('time.invalid')}</p>}
    </div>
  );
}
