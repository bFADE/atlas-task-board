import { useTranslation } from 'react-i18next';
import { useUi } from '../store';
import { Modal } from './Modal';

export function ConfirmDialog() {
  const { t } = useTranslation();
  const { confirmState } = useUi();
  if (!confirmState) return null;
  const cancel = () => confirmState.resolve(false);

  return (
    <Modal
      title={t('confirm.title')}
      onClose={cancel}
      width="max-w-sm"
      footer={
        <>
          <div className="flex-1" />
          <button className="btn" onClick={cancel}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" autoFocus onClick={() => confirmState.resolve(true)}>
            {confirmState.confirmLabel ?? t('common.delete')}
          </button>
        </>
      }
    >
      <p className="text-sm">{confirmState.message}</p>
    </Modal>
  );
}
