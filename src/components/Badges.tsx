import { useTranslation } from 'react-i18next';
import { PRIORITY_COLORS, STATUS_COLORS, type Category, type Priority, type Status } from '../lib/types';

/** Translucent pill tinted with the given color (works in light and dark themes). */
export function Pill({ color, children, className = '' }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`tint inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-xs font-medium leading-4 ${className}`}
      style={{ ['--tint' as string]: color }}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  return <Pill color={STATUS_COLORS[status]}>{t(`status.${status}`)}</Pill>;
}

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  const { t } = useTranslation();
  if (!priority) return null;
  return <Pill color={PRIORITY_COLORS[priority]}>{t(`priority.${priority}`)}</Pill>;
}

export function CategoryTags({ ids, map }: { ids: number[]; map: Map<number, Category> }) {
  const cats = ids.map((id) => map.get(id)).filter((c): c is Category => !!c);
  if (!cats.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {cats.map((c) => (
        <Pill key={c.id} color={c.color}>
          {c.name}
        </Pill>
      ))}
    </div>
  );
}
