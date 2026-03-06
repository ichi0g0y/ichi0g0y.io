import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { HIDDEN_TAP_TARGET, HIDDEN_TAP_WINDOW_MS } from '../constants'
import { getAuthErrorMessage } from '../utils'

export function useAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [adminEmail, setAdminEmail] = useState<string | null>(null)
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)

  const tapStateRef = useRef({ count: 0, lastTappedAt: 0 })

  const isAdminEditing = useMemo(() => Boolean(accessToken) && isEditMode, [accessToken, isEditMode])

  const parseApiResponse = useCallback(async (response: Response) => {
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const message = (data as { message?: string } | null)?.message ?? 'APIリクエストに失敗しました'
      throw new Error(message)
    }
    return data as Record<string, unknown>
  }, [])

  const refreshAccessToken = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await parseApiResponse(response)
      const token = (data.accessToken as string | undefined) ?? null
      const email = (data.email as string | undefined) ?? null
      if (!token || !email) {
        return null
      }
      setAccessToken(token)
      setAdminEmail(email)
      return token
    } catch {
      setAccessToken(null)
      setAdminEmail(null)
      return null
    }
  }, [parseApiResponse])

  const requestWithAuth = useCallback(
    async (path: string, init: RequestInit) => {
      let token = accessToken
      if (!token) {
        token = await refreshAccessToken()
      }
      if (!token) {
        throw new Error('ログインが必要です')
      }

      const execute = async (authToken: string) => {
        const headers = new Headers(init.headers)
        headers.set('Authorization', `Bearer ${authToken}`)
        const response = await fetch(path, {
          ...init,
          headers,
          credentials: 'include',
        })
        return response
      }

      let response = await execute(token)
      if (response.status === 401) {
        const refreshedToken = await refreshAccessToken()
        if (!refreshedToken) {
          throw new Error('ログインの有効期限が切れました')
        }
        response = await execute(refreshedToken)
      }

      return parseApiResponse(response)
    },
    [accessToken, parseApiResponse, refreshAccessToken],
  )

  const handleHiddenTrigger = useCallback(() => {
    const now = Date.now()
    const tapState = tapStateRef.current
    if (now - tapState.lastTappedAt > HIDDEN_TAP_WINDOW_MS) {
      tapState.count = 0
    }
    tapState.count += 1
    tapState.lastTappedAt = now

    if (tapState.count >= HIDDEN_TAP_TARGET) {
      tapState.count = 0
      setIsAuthDialogOpen(true)
      setAuthMessage('')
    }
  }, [])

  const handleCloseAuthDialog = useCallback(() => {
    if (isAuthBusy) {
      return
    }
    setIsAuthDialogOpen(false)
    setAuthMessage('')
  }, [isAuthBusy])

  const handleStartGitHubAuth = useCallback(() => {
    setIsAuthBusy(true)
    setAuthMessage('GitHubへ移動しています...')
    window.location.assign('/api/auth/github/start')
  }, [])

  const handleLogout = useCallback(async () => {
    setIsAuthBusy(true)
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      setAccessToken(null)
      setAdminEmail(null)
      setIsEditMode(false)
      setIsAuthDialogOpen(false)
      setAuthMessage('ログアウトしました。')
    } finally {
      setIsAuthBusy(false)
    }
  }, [])

  useEffect(() => {
    void refreshAccessToken()
  }, [refreshAccessToken])

  useEffect(() => {
    const url = new URL(window.location.href)
    const authError = url.searchParams.get('auth_error')
    if (!authError) {
      return
    }
    setAuthMessage(getAuthErrorMessage(authError))
    setIsAuthDialogOpen(true)
    url.searchParams.delete('auth_error')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  return {
    accessToken,
    setAccessToken,
    adminEmail,
    isAuthDialogOpen,
    authMessage,
    isAuthBusy,
    isEditMode,
    setIsEditMode,
    isAdminEditing,
    parseApiResponse,
    refreshAccessToken,
    requestWithAuth,
    handleHiddenTrigger,
    handleCloseAuthDialog,
    handleStartGitHubAuth,
    handleLogout,
  }
}
