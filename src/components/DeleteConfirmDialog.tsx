import { Cross2Icon } from '@radix-ui/react-icons'

import type { GearItem } from '../types'

export type DeleteConfirmDialogProps = {
  deleteConfirmTarget: GearItem
  isDeleting: boolean
  onConfirm: () => void
  onClose: () => void
}

export function DeleteConfirmDialog({ deleteConfirmTarget, isDeleting, onConfirm, onClose }: DeleteConfirmDialogProps) {
  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="auth-dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="カード削除確認"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">カードを削除</p>
          <button
            className="auth-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="閉じる"
          >
            <Cross2Icon />
          </button>
        </div>
        <p className="confirm-dialog-message">「{deleteConfirmTarget.title}」を削除しますか？</p>
        <div className="admin-form-actions">
          <button
            className="admin-button ghost"
            type="button"
            onClick={onClose}
            disabled={isDeleting}
          >
            キャンセル
          </button>
          <button
            className="admin-button danger"
            type="button"
            onClick={() => {
              void onConfirm()
            }}
            disabled={isDeleting}
          >
            {isDeleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </section>
    </div>
  )
}
