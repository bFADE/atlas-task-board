import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const openModals: object[] = [];

export function Modal({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-xl',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const { t } = useTranslation();

  // Escape closes only the top-most modal (e.g. a confirm dialog over the task modal).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const entry = {};
    openModals.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === entry) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(entry), 1);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className={`w-full ${width} rounded-lg bg-surface shadow-pop`}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-icon" onClick={onClose} title={t('common.close')} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
