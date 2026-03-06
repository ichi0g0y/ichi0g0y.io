import { Cross2Icon } from '@radix-ui/react-icons'

type WithingsSettingsDialogProps = {
  isOpen: boolean
  isConnecting: boolean
  isSyncing: boolean
  isTestingNotify: boolean
  isSubscribingWebhook: boolean
  isUnsubscribingWebhook: boolean
  title: string
  description: string
  connectLabel: string
  syncLabel: string
  notifyTestLabel: string
  subscribeWebhookLabel: string
  unsubscribeWebhookLabel: string
  statusLabel: string
  statusValue: string
  userLabel: string
  userValue: string
  lastSyncedLabel: string
  lastSyncedValue: string
  onClose: () => void
  onConnect: () => void
  onSync: () => void
  onTestNotify: () => void
  onSubscribeWebhook: () => void
  onUnsubscribeWebhook: () => void
  canSync: boolean
  canManageWebhook: boolean
  canUnsubscribeWebhook: boolean
}

export function WithingsSettingsDialog({
  isOpen,
  isConnecting,
  isSyncing,
  isTestingNotify,
  isSubscribingWebhook,
  isUnsubscribingWebhook,
  title,
  description,
  connectLabel,
  syncLabel,
  notifyTestLabel,
  subscribeWebhookLabel,
  unsubscribeWebhookLabel,
  statusLabel,
  statusValue,
  userLabel,
  userValue,
  lastSyncedLabel,
  lastSyncedValue,
  onClose,
  onConnect,
  onSync,
  onTestNotify,
  onSubscribeWebhook,
  onUnsubscribeWebhook,
  canSync,
  canManageWebhook,
  canUnsubscribeWebhook,
}: WithingsSettingsDialogProps) {
  if (!isOpen) {
    return null
  }

  const isBusy = isConnecting || isSyncing || isTestingNotify || isSubscribingWebhook || isUnsubscribingWebhook

  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">{title}</p>
          <button
            className="auth-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="閉じる"
          >
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
            <button className="admin-button ghost" type="button" onClick={onConnect} disabled={isBusy}>
              {connectLabel}
            </button>
            <button className="admin-button ghost" type="button" onClick={onSync} disabled={!canSync || isBusy}>
              {syncLabel}
            </button>
            <button className="admin-button ghost" type="button" onClick={onSubscribeWebhook} disabled={!canManageWebhook || isBusy}>
              {subscribeWebhookLabel}
            </button>
            <button
              className="admin-button ghost"
              type="button"
              onClick={onUnsubscribeWebhook}
              disabled={!canUnsubscribeWebhook || isBusy}
            >
              {unsubscribeWebhookLabel}
            </button>
            <button className="admin-button ghost" type="button" onClick={onTestNotify} disabled={!canSync || isBusy}>
              {notifyTestLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
