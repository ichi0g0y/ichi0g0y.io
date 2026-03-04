import { Cross2Icon } from '@radix-ui/react-icons'
import type { FormEvent } from 'react'

export type RenameCategoryDialogProps = {
  renameCategoryValue: string
  renameCategoryValueEn: string
  isRenamingCategory: boolean
  onChange: (value: string) => void
  onChangeEn: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
}

export function RenameCategoryDialog({
  renameCategoryValue,
  renameCategoryValueEn,
  isRenamingCategory,
  onChange,
  onChangeEn,
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
            日本語カテゴリ
            <input
              className="admin-input"
              type="text"
              value={renameCategoryValue}
              onChange={(event) => onChange(event.target.value)}
              placeholder="新しいカテゴリ名（日本語）"
              required
            />
          </label>
          <label className="admin-label">
            英語カテゴリ
            <input
              className="admin-input"
              type="text"
              value={renameCategoryValueEn}
              onChange={(event) => onChangeEn(event.target.value)}
              placeholder="New category name (English)"
            />
          </label>
          <p className="add-dialog-note">同じカテゴリのカードすべてに反映されます。</p>
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
