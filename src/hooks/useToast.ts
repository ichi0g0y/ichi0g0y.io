import { useCallback, useEffect, useState } from 'react'

import type { ToastState, ToastTone } from '../types'

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
    }, 2800)
    return () => {
      clearTimeout(timer)
    }
  }, [toast])

  return { toast, setToast, showToast }
}
