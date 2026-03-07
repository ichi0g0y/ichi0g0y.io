import { Cross2Icon } from '@radix-ui/react-icons'
import type { FormEvent } from 'react'

type DiscordSettingsDialogProps = {
  isOpen: boolean
  isSaving: boolean
  isTesting: boolean
  title: string
  description: string
  webhookLabel: string
  webhookPlaceholder: string
  webhookDescription: string
  saveLabel: string
  testLabel: string
  webhookUrl: string
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSetWebhookUrl: (value: string) => void
  onTest: () => void
}

export function DiscordSettingsDialog({
  isOpen,
  isSaving,
  isTesting,
  title,
  description,
  webhookLabel,
  webhookPlaceholder,
  webhookDescription,
  saveLabel,
  testLabel,
  webhookUrl,
  onClose,
  onSubmit,
  onSetWebhookUrl,
  onTest,
}: DiscordSettingsDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">{title}</p>
          <button className="auth-dialog-close" type="button" onClick={onClose} disabled={isSaving || isTesting} aria-label="閉じる">
            <Cross2Icon />
          </button>
        </div>

        <form className="admin-form add-form" onSubmit={onSubmit}>
          <p className="twitter-template-note">{description}</p>
          <label className="admin-label">
            {webhookLabel}
            <input
              className="admin-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={webhookUrl}
              onChange={(event) => onSetWebhookUrl(event.target.value)}
              placeholder={webhookPlaceholder}
            />
            <span>{webhookDescription}</span>
          </label>
          <div className="auth-step-actions">
            <button className="admin-button ghost" type="button" onClick={onTest} disabled={isSaving || isTesting}>
              {testLabel}
            </button>
            <button className="admin-button" type="submit" disabled={isSaving || isTesting}>
              {saveLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
