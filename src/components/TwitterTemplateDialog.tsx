import { Cross2Icon } from '@radix-ui/react-icons'
import type { FormEvent } from 'react'

import { ImageFitSwitch } from './ImageFitSwitch'

export type TwitterTemplateDialogPlaceholder = {
  key: string
  token: string
  label: string
}

export type TwitterTemplateDialogProps = {
  isOpen: boolean
  isSaving: boolean
  isConnecting: boolean
  title: string
  description: string
  autoPostLabel: string
  autoPostEnabled: boolean
  templateLabel: string
  placeholderTitle: string
  previewTitle: string
  chartPreviewTitle: string
  chartPreviewEmpty: string
  chartPreviewRefreshLabel: string
  saveLabel: string
  connectLabel: string
  testLabel: string
  isTesting: boolean
  accountLabel: string
  accountValue: string
  lastPostedLabel: string
  lastPostedValue: string
  template: string
  preview: string
  chartPreviewUrl: string | null
  placeholders: TwitterTemplateDialogPlaceholder[]
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onConnect: () => void
  onTestPost: () => void
  onSetAutoPostEnabled: (nextEnabled: boolean) => void
  onSetTemplate: (value: string) => void
  onInsertPlaceholder: (placeholder: string) => void
  onRefreshChartPreview: () => void
}

export function TwitterTemplateDialog({
  isOpen,
  isSaving,
  isConnecting,
  title,
  description,
  autoPostLabel,
  autoPostEnabled,
  templateLabel,
  placeholderTitle,
  previewTitle,
  chartPreviewTitle,
  chartPreviewEmpty,
  chartPreviewRefreshLabel,
  saveLabel,
  connectLabel,
  testLabel,
  isTesting,
  accountLabel,
  accountValue,
  lastPostedLabel,
  lastPostedValue,
  template,
  preview,
  chartPreviewUrl,
  placeholders,
  onClose,
  onSubmit,
  onConnect,
  onTestPost,
  onSetAutoPostEnabled,
  onSetTemplate,
  onInsertPlaceholder,
  onRefreshChartPreview,
}: TwitterTemplateDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="auth-dialog twitter-template-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">{title}</p>
          <button className="auth-dialog-close" type="button" onClick={onClose} disabled={isSaving} aria-label="閉じる">
            <Cross2Icon />
          </button>
        </div>

        <form className="admin-form add-form" onSubmit={onSubmit}>
          <p className="twitter-template-note">{description}</p>
          <div className="auth-step-actions twitter-template-actions">
            <button className="admin-button ghost" type="button" onClick={onConnect} disabled={isSaving || isConnecting}>
              {connectLabel}
            </button>
            <button className="admin-button ghost" type="button" onClick={onTestPost} disabled={isSaving || isTesting}>
              {testLabel}
            </button>
          </div>
          <div className="twitter-template-meta">
            <p className="twitter-template-meta-item">
              <span>{accountLabel}</span>
              <strong>{accountValue}</strong>
            </p>
            <p className="twitter-template-meta-item">
              <span>{lastPostedLabel}</span>
              <strong>{lastPostedValue}</strong>
            </p>
          </div>
          <div className="admin-switch-row">
            <span className="admin-switch-text">{autoPostLabel}</span>
            <ImageFitSwitch checked={autoPostEnabled} onCheckedChange={onSetAutoPostEnabled} />
          </div>
          <label className="admin-label">
            {templateLabel}
            <textarea
              className="admin-textarea twitter-template-textarea"
              value={template}
              onChange={(event) => onSetTemplate(event.target.value)}
              placeholder="{{weight}}kg"
              required
            />
          </label>
          <div className="twitter-template-placeholder-block">
            <p className="twitter-template-section-title">{placeholderTitle}</p>
            <div className="twitter-template-placeholder-list">
              {placeholders.map((placeholder) => (
                <button
                  key={placeholder.key}
                  className="twitter-template-placeholder-button"
                  type="button"
                  onClick={() => onInsertPlaceholder(placeholder.token)}
                >
                  <span>{placeholder.label}</span>
                  <code>{placeholder.token}</code>
                </button>
              ))}
            </div>
          </div>
          <div className="twitter-template-preview-block">
            <p className="twitter-template-section-title">{previewTitle}</p>
            <pre className="twitter-template-preview">{preview || ' '}</pre>
          </div>
          <div className="twitter-template-preview-block">
            <div className="twitter-template-section-header">
              <p className="twitter-template-section-title">{chartPreviewTitle}</p>
              <button
                className="twitter-template-preview-refresh"
                type="button"
                onClick={onRefreshChartPreview}
                disabled={!chartPreviewUrl}
              >
                {chartPreviewRefreshLabel}
              </button>
            </div>
            <div className="twitter-template-chart-preview">
              {chartPreviewUrl ? (
                <img key={chartPreviewUrl} src={chartPreviewUrl} alt={chartPreviewTitle} />
              ) : (
                <p className="twitter-template-chart-preview-empty">{chartPreviewEmpty}</p>
              )}
            </div>
          </div>
          <div className="auth-step-actions">
            <button className="admin-button" type="submit" disabled={isSaving || template.trim().length < 1}>
              {saveLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
