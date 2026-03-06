import { Cross2Icon } from '@radix-ui/react-icons'

type WithingsSettingsDialogProps = {
  isOpen: boolean
  isConnecting: boolean
  isSyncing: boolean
  title: string
  description: string
  connectLabel: string
  syncLabel: string
  statusLabel: string
  statusValue: string
  userLabel: string
  userValue: string
  lastSyncedLabel: string
  lastSyncedValue: string
  onClose: () => void
  onConnect: () => void
  onSync: () => void
  canSync: boolean
}

export function WithingsSettingsDialog({
  isOpen,
  isConnecting,
  isSyncing,
  title,
  description,
  connectLabel,
  syncLabel,
  statusLabel,
  statusValue,
  userLabel,
  userValue,
  lastSyncedLabel,
  lastSyncedValue,
  onClose,
  onConnect,
  onSync,
  canSync,
}: WithingsSettingsDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">{title}</p>
          <button className="auth-dialog-close" type="button" onClick={onClose} disabled={isConnecting || isSyncing} aria-label="閉じる">
            <Cross2Icon />
          </button>
        </div>

        <div className="admin-form add-form">
          <p className="twitter-template-note">{description}</p>
          <div className="twitter-template-meta">
            <p className="twitter-template-meta-item">
              <span>{statusLabel}</span>
              <strong>{statusValue}</strong>
            </p>
            <p className="twitter-template-meta-item">
              <span>{userLabel}</span>
              <strong>{userValue}</strong>
            </p>
            <p className="twitter-template-meta-item">
              <span>{lastSyncedLabel}</span>
              <strong>{lastSyncedValue}</strong>
            </p>
          </div>
          <div className="auth-step-actions twitter-template-actions">
            <button className="admin-button ghost" type="button" onClick={onConnect} disabled={isConnecting || isSyncing}>
              {connectLabel}
            </button>
            <button className="admin-button ghost" type="button" onClick={onSync} disabled={!canSync || isConnecting || isSyncing}>
              {syncLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
