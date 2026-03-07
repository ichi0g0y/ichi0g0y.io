import { useCallback, useEffect, useMemo, useState } from 'react'

import type { AppLocale, ToastTone, WithingsStatus, WithingsWorkoutDetailPoint } from '../types'
import { getWithingsErrorMessage } from '../utils'

const WITHINGS_STATUS_CACHE_KEY = 'withings-status-cache-v1'
const EMPTY_WITHINGS_WORKOUTS: NonNullable<WithingsStatus['recentWorkouts']> = []
const EMPTY_WITHINGS_WEIGHTS: NonNullable<WithingsStatus['recentWeights']> = []

type Labels = {
  withingsStatusLoading: string
  withingsStatusConnected: string
  withingsStatusPending: string
  withingsTrendTitle: string
  withingsTrendNoData: string
  withingsRange7: string
  withingsRange30: string
  withingsRange90: string
  withingsChartWeight: string
  withingsChartBmi: string
  withingsChartFatRatio: string
  withingsSettingsLastSyncedEmpty: string
  withingsWebhookSubscribed: string
  withingsWebhookUnsubscribed: string
  withingsWebhookSubscribeButton: string
  withingsWebhookSubscribingButton: string
  withingsWebhookUnsubscribeButton: string
  withingsWebhookUnsubscribingButton: string
  withingsWorkoutNotifyTestButton: string
  withingsWorkoutNotifyTestingButton: string
}

export type UseWithingsDeps = {
  activeLanguage: AppLocale
  labels: Labels
  requestWithAuth: (url: string, options: RequestInit) => Promise<Record<string, unknown>>
  showToast: (message: string, tone: ToastTone) => void
}

function loadCachedWithingsStatus(): WithingsStatus | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = window.localStorage.getItem(WITHINGS_STATUS_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as WithingsStatus
    if (!parsed || typeof parsed !== 'object' || typeof parsed.connected !== 'boolean') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function formatWeightKg(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return `${value.toFixed(2)} kg`
}

export function formatBmi(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return value.toFixed(2)
}

export function formatFatRatio(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return `${value.toFixed(2)} %`
}

export function formatDistanceMeters(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return `${(value / 1000).toFixed(2)} km`
}

export function formatCalories(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '-'
  }
  return `${value.toFixed(1)} kcal`
}

export function formatDuration(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return '-'
  }
  const total = Math.trunc(value)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) {
    return `${h}h ${m}m ${s}s`
  }
  return `${m}m ${s}s`
}

function formatWithingsMetricValue(
  value: number | null | undefined,
  unit: string | null | undefined,
  valueText?: string | null,
) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalizedUnit = unit?.trim() ?? ''
    const renderedValue = Number.isInteger(value) ? String(value) : value.toFixed(2)
    return normalizedUnit ? `${renderedValue} ${normalizedUnit}` : renderedValue
  }
  if (typeof valueText === 'string' && valueText.trim()) {
    const trimmed = valueText.trim()
    return trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed
  }
  return '-'
}

export function formatWorkoutDetailValue(detail: WithingsWorkoutDetailPoint) {
  if (detail.key === 'data.distance' || detail.key === 'data.manual_distance') {
    return formatDistanceMeters(detail.value)
  }
  if (detail.key === 'data.calories' || detail.key === 'data.manual_calories') {
    return formatCalories(detail.value)
  }
  if (detail.key === 'data.duration') {
    return formatDuration(detail.value)
  }
  return formatWithingsMetricValue(detail.value, detail.unit, detail.valueText)
}

export function useWithings(deps: UseWithingsDeps) {
  const { activeLanguage, labels, requestWithAuth, showToast } = deps

  const [withingsStatus, setWithingsStatus] = useState<WithingsStatus | null>(loadCachedWithingsStatus)
  const [isWithingsLoading, setIsWithingsLoading] = useState(true)
  const [isWithingsConnecting, setIsWithingsConnecting] = useState(false)
  const [isWithingsSyncing, setIsWithingsSyncing] = useState(false)
  const [isWithingsNotifyTesting, setIsWithingsNotifyTesting] = useState(false)
  const [isWithingsWorkoutNotifyTesting, setIsWithingsWorkoutNotifyTesting] = useState(false)
  const [isWithingsWebhookSubscribing, setIsWithingsWebhookSubscribing] = useState(false)
  const [isWithingsWebhookUnsubscribing, setIsWithingsWebhookUnsubscribing] = useState(false)
  const [selectedWithingsView, setSelectedWithingsView] = useState<'weight' | 'workout'>('weight')
  const [isWithingsSettingsDialogOpen, setIsWithingsSettingsDialogOpen] = useState(false)

  const formatWithingsMeasuredAt = useCallback(
    (unixSeconds: number | null | undefined) => {
      if (!unixSeconds || unixSeconds < 1) {
        return '-'
      }
      return new Date(unixSeconds * 1000).toLocaleString(activeLanguage === 'ja' ? 'ja-JP' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    },
    [activeLanguage],
  )

  const withingsStatusValue = isWithingsLoading
    ? labels.withingsStatusLoading
    : withingsStatus?.connected
      ? labels.withingsStatusConnected
      : labels.withingsStatusPending
  const latestMeasurement = withingsStatus?.latestMeasurement ?? null
  const recentWorkouts = withingsStatus?.recentWorkouts ?? EMPTY_WITHINGS_WORKOUTS
  const recentWeights = withingsStatus?.recentWeights ?? EMPTY_WITHINGS_WEIGHTS

  const withingsTrendLabels = useMemo(
    () => ({
      title: labels.withingsTrendTitle,
      noData: labels.withingsTrendNoData,
      range7: labels.withingsRange7,
      range30: labels.withingsRange30,
      range90: labels.withingsRange90,
      weight: labels.withingsChartWeight,
      bmi: labels.withingsChartBmi,
      fatRatio: labels.withingsChartFatRatio,
    }),
    [labels],
  )
  const latestWeightLabel = formatWeightKg(latestMeasurement?.weightKg)
  const latestFatRatioLabel = formatFatRatio(latestMeasurement?.fatRatio)
  const latestBmiLabel = formatBmi(latestMeasurement?.bmi)
  const latestMeasuredAtLabel = formatWithingsMeasuredAt(latestMeasurement?.measuredAt)
  const withingsConnectedUserLabel = withingsStatus?.connection?.userId?.trim() || labels.withingsStatusPending
  const withingsLastSyncedLabel = withingsStatus?.connection?.lastSyncedAt
    ? formatWithingsMeasuredAt(withingsStatus.connection.lastSyncedAt)
    : labels.withingsSettingsLastSyncedEmpty
  const isWithingsWebhookSubscribed = Boolean(withingsStatus?.connection?.notifyCallbackUrl)

  const loadWithingsStatus = useCallback(async () => {
    setIsWithingsLoading(true)
    try {
      const response = await fetch('/api/withings/status')
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error((data as { message?: string } | null)?.message ?? 'APIリクエストに失敗しました')
      }
      const nextStatus = data as unknown as WithingsStatus
      setWithingsStatus(nextStatus)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(WITHINGS_STATUS_CACHE_KEY, JSON.stringify(nextStatus))
      }
    } catch {
      // 取得失敗時は前回の表示を維持し、ちらつきを防ぐ。
    } finally {
      setIsWithingsLoading(false)
    }
  }, [])

  const handleWithingsConnect = useCallback(async () => {
    if (isWithingsConnecting) {
      return
    }
    setIsWithingsConnecting(true)
    try {
      const data = await requestWithAuth('/api/admin/withings/connect', {
        method: 'POST',
      })
      const authorizeUrl = typeof data.authorizeUrl === 'string' ? data.authorizeUrl.trim() : ''
      if (!authorizeUrl) {
        throw new Error('Withings認証URLの取得に失敗しました')
      }
      window.location.assign(authorizeUrl)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Withings連携の開始に失敗しました。'
            : 'Failed to start Withings authorization.'
      showToast(message, 'error')
      setIsWithingsConnecting(false)
    }
  }, [activeLanguage, isWithingsConnecting, requestWithAuth, showToast])

  const handleWithingsSync = useCallback(async () => {
    if (isWithingsSyncing) {
      return
    }
    setIsWithingsSyncing(true)
    try {
      await requestWithAuth('/api/admin/withings/sync', {
        method: 'POST',
      })
      await loadWithingsStatus()
      showToast(activeLanguage === 'ja' ? 'Withingsデータを同期しました。' : 'Withings data synced.', 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Withings同期に失敗しました。'
            : 'Failed to sync Withings data.'
      showToast(message, 'error')
    } finally {
      setIsWithingsSyncing(false)
    }
  }, [activeLanguage, isWithingsSyncing, loadWithingsStatus, requestWithAuth, showToast])

  const handleWithingsNotifyTest = useCallback(async () => {
    if (isWithingsNotifyTesting) {
      return
    }
    setIsWithingsNotifyTesting(true)
    try {
      const data = await requestWithAuth('/api/admin/withings/notify-test', {
        method: 'POST',
      })
      await loadWithingsStatus()
      const message =
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : activeLanguage === 'ja'
            ? '擬似Notifyを実行しました。'
            : 'Simulated notify executed.'
      const tone = data.latestNewWeightMeasurement ? 'success' : 'info'
      showToast(message, tone)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? '擬似Notifyの実行に失敗しました。'
            : 'Failed to run simulated notify.'
      showToast(message, 'error')
    } finally {
      setIsWithingsNotifyTesting(false)
    }
  }, [activeLanguage, isWithingsNotifyTesting, loadWithingsStatus, requestWithAuth, showToast])

  const handleWithingsWorkoutNotifyTest = useCallback(async () => {
    if (isWithingsWorkoutNotifyTesting) {
      return
    }
    setIsWithingsWorkoutNotifyTesting(true)
    try {
      const data = await requestWithAuth('/api/admin/withings/notify-test?appli=activity', {
        method: 'POST',
      })
      await loadWithingsStatus()
      const message =
        typeof data.message === 'string' && data.message.trim()
          ? data.message
          : activeLanguage === 'ja'
            ? '擬似ワークアウトNotifyを実行しました。'
            : 'Simulated workout notify executed.'
      showToast(message, 'info')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? '擬似ワークアウトNotifyの実行に失敗しました。'
            : 'Failed to run simulated workout notify.'
      showToast(message, 'error')
    } finally {
      setIsWithingsWorkoutNotifyTesting(false)
    }
  }, [activeLanguage, isWithingsWorkoutNotifyTesting, loadWithingsStatus, requestWithAuth, showToast])

  const handleWithingsWebhookSubscribe = useCallback(async () => {
    if (isWithingsWebhookSubscribing) {
      return
    }
    setIsWithingsWebhookSubscribing(true)
    try {
      const data = await requestWithAuth('/api/admin/withings/webhook/subscribe', {
        method: 'POST',
      })
      await loadWithingsStatus()
      const message =
        typeof data.message === 'string' && data.message.trim() ? data.message : labels.withingsWebhookSubscribed
      showToast(message, 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Withings通知(Webhook)の登録に失敗しました。'
            : 'Failed to register the Withings webhook.'
      showToast(message, 'error')
    } finally {
      setIsWithingsWebhookSubscribing(false)
    }
  }, [activeLanguage, isWithingsWebhookSubscribing, labels.withingsWebhookSubscribed, loadWithingsStatus, requestWithAuth, showToast])

  const handleWithingsWebhookUnsubscribe = useCallback(async () => {
    if (isWithingsWebhookUnsubscribing) {
      return
    }
    setIsWithingsWebhookUnsubscribing(true)
    try {
      const data = await requestWithAuth('/api/admin/withings/webhook/unsubscribe', {
        method: 'POST',
      })
      await loadWithingsStatus()
      const message =
        typeof data.message === 'string' && data.message.trim() ? data.message : labels.withingsWebhookUnsubscribed
      showToast(message, 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Withings通知(Webhook)の解除に失敗しました。'
            : 'Failed to unregister the Withings webhook.'
      showToast(message, 'error')
    } finally {
      setIsWithingsWebhookUnsubscribing(false)
    }
  }, [
    activeLanguage,
    isWithingsWebhookUnsubscribing,
    labels.withingsWebhookUnsubscribed,
    loadWithingsStatus,
    requestWithAuth,
    showToast,
  ])

  const handleOpenWithingsSettingsDialog = useCallback(() => {
    setIsWithingsSettingsDialogOpen(true)
  }, [])

  const handleCloseWithingsSettingsDialog = useCallback(() => {
    if (
      isWithingsConnecting ||
      isWithingsSyncing ||
      isWithingsNotifyTesting ||
      isWithingsWorkoutNotifyTesting ||
      isWithingsWebhookSubscribing ||
      isWithingsWebhookUnsubscribing
    ) {
      return
    }
    setIsWithingsSettingsDialogOpen(false)
  }, [
    isWithingsConnecting,
    isWithingsNotifyTesting,
    isWithingsWorkoutNotifyTesting,
    isWithingsSyncing,
    isWithingsWebhookSubscribing,
    isWithingsWebhookUnsubscribing,
  ])

  useEffect(() => {
    void loadWithingsStatus()
  }, [loadWithingsStatus])

  useEffect(() => {
    const url = new URL(window.location.href)
    const withingsError = url.searchParams.get('withings_error')
    const withingsStatusQuery = url.searchParams.get('withings')
    if (!withingsError && !withingsStatusQuery) {
      return
    }

    if (withingsError) {
      const tone = withingsError === 'withings_notify_subscribe_failed' && withingsStatusQuery === 'connected' ? 'info' : 'error'
      showToast(getWithingsErrorMessage(withingsError), tone)
    } else if (withingsStatusQuery === 'connected') {
      showToast(activeLanguage === 'ja' ? 'Withings連携が完了しました。' : 'Withings has been connected.', 'success')
    }

    url.searchParams.delete('withings_error')
    url.searchParams.delete('withings')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    void loadWithingsStatus()
  }, [activeLanguage, loadWithingsStatus, showToast])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const syncWithingsViewWithHash = () => {
      if (window.location.hash === '#weight-graph') {
        setSelectedWithingsView('weight')
        window.requestAnimationFrame(() => {
          document.getElementById('weight-graph')?.scrollIntoView({ block: 'start' })
        })
      }
    }

    syncWithingsViewWithHash()
    window.addEventListener('hashchange', syncWithingsViewWithHash)
    return () => {
      window.removeEventListener('hashchange', syncWithingsViewWithHash)
    }
  }, [])

  return {
    withingsStatus,
    isWithingsLoading,
    isWithingsConnecting,
    isWithingsSyncing,
    isWithingsNotifyTesting,
    isWithingsWorkoutNotifyTesting,
    isWithingsWebhookSubscribing,
    isWithingsWebhookUnsubscribing,
    isWithingsWebhookSubscribed,
    selectedWithingsView,
    setSelectedWithingsView,
    isWithingsSettingsDialogOpen,
    withingsStatusValue,
    latestMeasurement,
    recentWorkouts,
    recentWeights,
    withingsTrendLabels,
    latestWeightLabel,
    latestFatRatioLabel,
    latestBmiLabel,
    latestMeasuredAtLabel,
    withingsConnectedUserLabel,
    withingsLastSyncedLabel,
    formatWithingsMeasuredAt,
    loadWithingsStatus,
    handleWithingsConnect,
    handleWithingsSync,
    handleWithingsNotifyTest,
    handleWithingsWorkoutNotifyTest,
    handleWithingsWebhookSubscribe,
    handleWithingsWebhookUnsubscribe,
    handleOpenWithingsSettingsDialog,
    handleCloseWithingsSettingsDialog,
  }
}
