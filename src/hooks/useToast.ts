import { useCallback, useEffect, useState } from 'react'

import type { ToastState, ToastTone } from '../types'

const TOAST_DURATION_MS = 7000

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: Date.now(), message, tone })
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, TOAST_DURATION_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [toast])

  return { toast, setToast, showToast }
}
