import { Cross2Icon } from '@radix-ui/react-icons'

export type AuthDialogProps = {
  isOpen: boolean
  accessToken: string | null
  adminEmail: string | null
  authMessage: string
  isAuthBusy: boolean
  onStartGitHubAuth: () => void
  onLogout: () => void
  onClose: () => void
}

export function AuthDialog({
  isOpen,
  accessToken,
  adminEmail,
  authMessage,
  isAuthBusy,
  onStartGitHubAuth,
  onLogout,
  onClose,
}: AuthDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="auth-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="管理ログイン"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-dialog-header">
          <p className="auth-dialog-title">管理モード</p>
          <button
            className="auth-dialog-close"
            type="button"
            onClick={onClose}
            disabled={isAuthBusy}
            aria-label="閉じる"
          >
            <Cross2Icon />
          </button>
        </div>

        {accessToken && adminEmail ? (
          <div className="admin-signed-in">
            <p className="admin-state">ログイン中: {adminEmail}</p>
            <button className="admin-button ghost" type="button" onClick={onLogout} disabled={isAuthBusy}>
              ログアウト
            </button>
          </div>
        ) : (
          <div className="admin-form auth-form">
            <p className="auth-step-note">GitHubアカウントで管理モードにログインします。</p>
            <button className="admin-button" type="button" onClick={onStartGitHubAuth} disabled={isAuthBusy}>
              {isAuthBusy ? '移動中...' : 'GitHubでログイン'}
            </button>
          </div>
        )}

        {authMessage ? <p className="admin-message">{authMessage}</p> : null}
      </section>
    </div>
  )
}
