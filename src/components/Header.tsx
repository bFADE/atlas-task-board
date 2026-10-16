import { useTranslation } from 'react-i18next';
import { useUi } from '../store';

export type View = 'board' | 'calendar' | 'active' | 'all';
export const VIEWS: View[] = ['board', 'calendar', 'active', 'all'];

export function Logo({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="#2383E2" />
      <g fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="16" cy="16" r="9" />
        <ellipse cx="16" cy="16" rx="3.8" ry="9" />
        <path d="M7 16h18M8.4 11.3h15.2M8.4 20.7h15.2" />
      </g>
    </svg>
  );
}

export function Header({
  view,
  onView,
  theme,
  onToggleTheme,
}: {
  view: View;
  onView: (v: View) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { setSettingsOpen } = useUi();
  const lang = i18n.language;

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 pt-3 sm:px-6">
        <Logo />
        <h1 className="truncate text-lg font-bold">{t('app.title')}</h1>
        <div className="flex-1" />
        <div className="flex items-center rounded-md border border-line p-0.5 text-xs font-semibold" role="group" aria-label={t('header.language')}>
          {(['pt', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => i18n.changeLanguage(l)}
              aria-pressed={lang === l}
              title={t(`header.lang_${l}`)}
              className={`rounded px-2 py-1 ${lang === l ? 'bg-fg text-surface' : 'text-muted hover:bg-hover'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          className="btn-icon"
          onClick={onToggleTheme}
          title={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
          aria-label={theme === 'dark' ? t('header.lightMode') : t('header.darkMode')}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="btn-icon" onClick={() => setSettingsOpen(true)} title={t('settings.title')} aria-label={t('settings.title')}>
          ⚙️
        </button>
      </div>
      <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 sm:px-6" aria-label={t('header.views')}>
        {VIEWS.map((v) => (
          <button
            key={v}
            onClick={() => onView(v)}
            aria-current={view === v ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-2.5 py-2.5 text-sm transition ${
              view === v ? 'border-fg font-semibold text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {t(`views.${v}`)}
          </button>
        ))}
      </nav>
    </header>
  );
}
