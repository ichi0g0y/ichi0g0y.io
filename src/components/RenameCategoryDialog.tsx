import { Cross2Icon } from '@radix-ui/react-icons'
import type { FormEvent } from 'react'

export type RenameCategoryDialogProps = {
  renameCategoryTarget: string
  renameCategoryValue: string
  isRenamingCategory: boolean
  onChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function RenameCategoryDialog({
  renameCategoryTarget,
  renameCategoryValue,
  isRenamingCategory,
  onChange,
  onSubmit,
  onClose,
}: RenameCategoryDialogProps) {
  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="auth-dialog category-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="カテゴリ名を変更"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">カテゴリ名を変更</p>
          <button
            className="auth-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isRenamingCategory}
            aria-label="閉じる"
          >
            <Cross2Icon />
          </button>
        </div>
        <form className="admin-form auth-form" onSubmit={onSubmit}>
          <label className="admin-label">
            変更前
            <input className="admin-input" type="text" value={renameCategoryTarget} readOnly />
          </label>
          <label className="admin-label">
            変更後
            <input
              className="admin-input"
              type="text"
              value={renameCategoryValue}
              onChange={(event) => onChange(event.target.value)}
              placeholder="新しいカテゴリ名"
              required
            />
          </label>
          <p className="add-dialog-note">同じカテゴリ名のカードすべてに反映されます。</p>
          <div className="admin-form-actions">
            <button
              className="admin-button ghost"
              type="button"
              onClick={onClose}
              disabled={isRenamingCategory}
            >
              キャンセル
            </button>
            <button className="admin-button" type="submit" disabled={isRenamingCategory}>
              {isRenamingCategory ? '変更中...' : '変更する'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
