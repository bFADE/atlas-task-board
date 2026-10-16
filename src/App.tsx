import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Header, VIEWS, type View } from './components/Header';
import { FilterBar, applyFilters } from './components/FilterBar';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { BoardView } from './views/BoardView';
import { CalendarView } from './views/CalendarView';
import { TableView } from './views/TableView';
import { PomodoroProvider } from './pomodoro/PomodoroProvider';
import { PomodoroWidget } from './pomodoro/PomodoroPanel';
import { DataProvider, UiProvider, useData } from './store';
import { EMPTY_FILTERS, type Filters } from './lib/types';
import { load, save } from './lib/storage';

type Theme = 'light' | 'dark';

export default function App() {
  return (
    <DataProvider>
      <UiProvider>
        <PomodoroProvider>
          <Shell />
        </PomodoroProvider>
      </UiProvider>
    </DataProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { tasks, loading, loadError, retryLoad } = useData();
  const [view, setView] = useState<View>(() => {
    const v = load<View>('view', 'board');
    return VIEWS.includes(v) ? v : 'board';
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  useEffect(() => save('view', view), [view]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Typing stays responsive: the (expensive) filtered views update with a deferred search value.
  const search = useDeferredValue(filters.search);
  const { categories, priorities, statuses } = filters;
  const filtered = useMemo(
    () => applyFilters(tasks, { search, categories, priorities, statuses }),
    [tasks, search, categories, priorities, statuses],
  );

  return (
    <div className="min-h-screen bg-surface text-fg">
      <Header
        view={view}
        onView={setView}
        theme={theme}
        onToggleTheme={() => setTheme((x) => (x === 'dark' ? 'light' : 'dark'))}
      />
      <FilterBar filters={filters} onChange={setFilters} />
      <main className="mx-auto max-w-[1600px] pb-20">
        {loading ? (
          <p className="px-6 py-10 text-center text-muted">{t('common.loading')}</p>
        ) : loadError ? (
          <div role="alert" className="mx-auto mt-12 max-w-md rounded-lg border border-line bg-panel p-6 text-center">
            <p className="text-3xl">🔌</p>
            <h2 className="mt-2 font-semibold">{t('serverDown.title')}</h2>
            <p className="mt-2 text-sm text-muted">{t('serverDown.body')}</p>
            <button className="btn btn-primary mt-4" onClick={retryLoad}>
              {t('serverDown.retry')}
            </button>
          </div>
        ) : view === 'board' ? (
          <BoardView tasks={filtered} statuses={filters.statuses} />
        ) : view === 'calendar' ? (
          <CalendarView tasks={filtered} />
        ) : (
          <TableView key={view} tasks={filtered} mode={view} />
        )}
      </main>
      <TaskModal />
      <SettingsModal />
      <ConfirmDialog />
      <PomodoroWidget />
    </div>
  );
}
