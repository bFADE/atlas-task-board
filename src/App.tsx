import { useEffect, useMemo, useState } from 'react';
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
  const { tasks, loading } = useData();
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

  const filtered = useMemo(() => applyFilters(tasks, filters), [tasks, filters]);

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
