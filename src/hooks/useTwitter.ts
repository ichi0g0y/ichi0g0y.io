import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import type { AppLocale, ToastTone, TwitterStatus } from '../types'
import { getTwitterAuthErrorMessage } from '../utils'

export const DEFAULT_TWITTER_TEMPLATE = '体重 {{weight}}kg / 体脂肪率 {{fat_ratio}}% / BMI {{bmi}}\n{{measured_at}}'
export const TWITTER_TEMPLATE_KEYS = ['weight', 'fat_ratio', 'bmi', 'measured_at', 'measured_date', 'measured_time', 'timestamp'] as const

export function trimTemplateNumber(value: number | null | undefined, fractionDigits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return ''
  }
  return value.toFixed(fractionDigits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function renderTwitterTemplate(template: string, values: Map<string, string>) {
  return template
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (matched, key: string) => values.get(key.toLowerCase()) ?? matched)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

type Labels = {
  twitterTemplateAccountEmpty: string
  twitterTemplateLastPostedEmpty: string
}

export type UseTwitterDeps = {
  accessToken: string | null
  activeLanguage: AppLocale
  labels: Labels
  requestWithAuth: (url: string, options: RequestInit) => Promise<Record<string, unknown>>
  showToast: (message: string, tone: ToastTone) => void
  setIsEditMode: (v: boolean) => void
  latestMeasurement: {
    weightKg: number | null
    fatRatio?: number | null
    bmi?: number | null
    measuredAt: number | null
  } | null
  formatWithingsMeasuredAt: (value: number | null | undefined) => string
}

export function useTwitter(deps: UseTwitterDeps) {
  const {
    accessToken,
    activeLanguage,
    labels,
    requestWithAuth,
    showToast,
    setIsEditMode,
    latestMeasurement,
    formatWithingsMeasuredAt,
  } = deps

  const [twitterStatus, setTwitterStatus] = useState<TwitterStatus | null>(null)
  const [isTwitterStatusLoading, setIsTwitterStatusLoading] = useState(false)
  const [isTwitterAuthBusy, setIsTwitterAuthBusy] = useState(false)
  const [isTwitterTemplateDialogOpen, setIsTwitterTemplateDialogOpen] = useState(false)
  const [isDiscordSettingsDialogOpen, setIsDiscordSettingsDialogOpen] = useState(false)
  const [twitterTemplateDraft, setTwitterTemplateDraft] = useState(DEFAULT_TWITTER_TEMPLATE)
  const [twitterAutoPostEnabledDraft, setTwitterAutoPostEnabledDraft] = useState(true)
  const [discordWebhookUrlDraft, setDiscordWebhookUrlDraft] = useState('')
  const [isTwitterTemplateSaving, setIsTwitterTemplateSaving] = useState(false)
  const [isDiscordSettingsSaving, setIsDiscordSettingsSaving] = useState(false)
  const [isDiscordSettingsTesting, setIsDiscordSettingsTesting] = useState(false)
  const [isTwitterLatestPosting, setIsTwitterLatestPosting] = useState(false)
  const [isTwitterTestPosting, setIsTwitterTestPosting] = useState(false)
  const [twitterChartPreviewVersion, setTwitterChartPreviewVersion] = useState(0)

  const twitterAccountLabel = twitterStatus?.connection?.username
    ? `@${twitterStatus.connection.username}`
    : labels.twitterTemplateAccountEmpty

  const twitterLastPostedLabel = twitterStatus?.settings.lastPostedTweetAt
    ? formatWithingsMeasuredAt(twitterStatus.settings.lastPostedTweetAt)
    : labels.twitterTemplateLastPostedEmpty

  const twitterTemplatePlaceholders = useMemo(
    () =>
      TWITTER_TEMPLATE_KEYS.map((key) => ({
        key,
        token: `{{${key}}}`,
        label:
          key === 'weight'
            ? activeLanguage === 'ja'
              ? '体重'
              : 'Weight'
            : key === 'fat_ratio'
              ? activeLanguage === 'ja'
                ? '体脂肪率'
                : 'Body Fat'
              : key === 'bmi'
                ? 'BMI'
                : key === 'measured_at'
                  ? activeLanguage === 'ja'
                    ? '計測日時'
                    : 'Measured At'
                  : key === 'measured_date'
                    ? activeLanguage === 'ja'
                      ? '計測日'
                      : 'Measured Date'
                    : key === 'measured_time'
                      ? activeLanguage === 'ja'
                        ? '計測時刻'
                        : 'Measured Time'
                      : activeLanguage === 'ja'
                        ? 'UNIX時刻'
                        : 'Timestamp',
      })),
    [activeLanguage],
  )

  const twitterTemplateValues = useMemo(() => {
    const measuredAt = latestMeasurement?.measuredAt ?? Math.floor(Date.now() / 1000)
    return new Map<string, string>([
      ['weight', trimTemplateNumber(latestMeasurement?.weightKg ?? 70.2)],
      ['fat_ratio', trimTemplateNumber(latestMeasurement?.fatRatio ?? 18.4)],
      ['bmi', trimTemplateNumber(latestMeasurement?.bmi ?? 22.1)],
      ['measured_at', formatWithingsMeasuredAt(measuredAt)],
      ['measured_date', new Date(measuredAt * 1000).toLocaleDateString(activeLanguage === 'ja' ? 'ja-JP' : 'en-US')],
      [
        'measured_time',
        new Date(measuredAt * 1000).toLocaleTimeString(activeLanguage === 'ja' ? 'ja-JP' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      ],
      ['timestamp', String(measuredAt)],
    ])
  }, [activeLanguage, formatWithingsMeasuredAt, latestMeasurement])

  const twitterTemplatePreview = useMemo(
    () => renderTwitterTemplate(twitterTemplateDraft, twitterTemplateValues),
    [twitterTemplateDraft, twitterTemplateValues],
  )

  const twitterChartPreviewUrl = useMemo(() => {
    if (!latestMeasurement?.measuredAt) {
      return null
    }
    return `/api/withings/chart.png?range=30&v=${latestMeasurement.measuredAt}-${twitterChartPreviewVersion}`
  }, [latestMeasurement?.measuredAt, twitterChartPreviewVersion])

  const loadTwitterStatus = useCallback(async () => {
    if (!accessToken) {
      setTwitterStatus(null)
      setTwitterTemplateDraft(DEFAULT_TWITTER_TEMPLATE)
      setTwitterAutoPostEnabledDraft(true)
      return
    }

    setIsTwitterStatusLoading(true)
    try {
      const data = await requestWithAuth('/api/admin/twitter/status', {
        method: 'GET',
      })
      const nextStatus = data as TwitterStatus
      setTwitterStatus(nextStatus)
      setTwitterTemplateDraft(nextStatus.settings.template || DEFAULT_TWITTER_TEMPLATE)
      setTwitterAutoPostEnabledDraft(nextStatus.settings.autoPostEnabled)
      setDiscordWebhookUrlDraft(nextStatus.settings.discordWebhookUrl || '')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'X設定の読み込みに失敗しました。'
            : 'Failed to load X settings.'
      showToast(message, 'error')
    } finally {
      setIsTwitterStatusLoading(false)
    }
  }, [accessToken, activeLanguage, requestWithAuth, showToast])

  const handleTwitterConnect = useCallback(async () => {
    if (isTwitterAuthBusy) {
      return
    }
    setIsTwitterAuthBusy(true)
    try {
      const data = await requestWithAuth('/api/admin/twitter/connect', {
        method: 'POST',
      })
      const authorizeUrl = typeof data.authorizeUrl === 'string' ? data.authorizeUrl.trim() : ''
      if (!authorizeUrl) {
        throw new Error('X認証URLの取得に失敗しました')
      }
      window.location.assign(authorizeUrl)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'X連携の開始に失敗しました。'
            : 'Failed to start X authorization.'
      showToast(message, 'error')
      setIsTwitterAuthBusy(false)
    }
  }, [activeLanguage, isTwitterAuthBusy, requestWithAuth, showToast])

  const handleOpenTwitterTemplateDialog = useCallback(() => {
    setTwitterTemplateDraft(twitterStatus?.settings.template || DEFAULT_TWITTER_TEMPLATE)
    setTwitterAutoPostEnabledDraft(twitterStatus?.settings.autoPostEnabled ?? true)
    setDiscordWebhookUrlDraft(twitterStatus?.settings.discordWebhookUrl || '')
    setTwitterChartPreviewVersion(Date.now())
    setIsTwitterTemplateDialogOpen(true)
  }, [twitterStatus])

  const handleCloseTwitterTemplateDialog = useCallback(() => {
    if (isTwitterTemplateSaving || isDiscordSettingsSaving || isDiscordSettingsTesting || isTwitterLatestPosting || isTwitterTestPosting) {
      return
    }
    setIsTwitterTemplateDialogOpen(false)
    setTwitterTemplateDraft(twitterStatus?.settings.template || DEFAULT_TWITTER_TEMPLATE)
    setTwitterAutoPostEnabledDraft(twitterStatus?.settings.autoPostEnabled ?? true)
  }, [isDiscordSettingsSaving, isDiscordSettingsTesting, isTwitterLatestPosting, isTwitterTemplateSaving, isTwitterTestPosting, twitterStatus])

  const handleOpenDiscordSettingsDialog = useCallback(() => {
    setDiscordWebhookUrlDraft(twitterStatus?.settings.discordWebhookUrl || '')
    setIsDiscordSettingsDialogOpen(true)
  }, [twitterStatus])

  const handleCloseDiscordSettingsDialog = useCallback(() => {
    if (isDiscordSettingsSaving || isDiscordSettingsTesting) {
      return
    }
    setIsDiscordSettingsDialogOpen(false)
    setDiscordWebhookUrlDraft(twitterStatus?.settings.discordWebhookUrl || '')
  }, [isDiscordSettingsSaving, isDiscordSettingsTesting, twitterStatus])

  const handleInsertTwitterPlaceholder = useCallback((placeholder: string) => {
    setTwitterTemplateDraft((previous) => {
      if (!previous.trim()) {
        return placeholder
      }
      const separator = previous.endsWith(' ') || previous.endsWith('\n') ? '' : ' '
      return `${previous}${separator}${placeholder}`
    })
  }, [])

  const handleSaveTwitterTemplate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const template = twitterTemplateDraft.trim()
      if (!template) {
        showToast(activeLanguage === 'ja' ? '投稿テンプレートを入力してください。' : 'Please enter a post template.', 'error')
        return
      }

      setIsTwitterTemplateSaving(true)
      try {
        const data = (await requestWithAuth('/api/admin/twitter/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template,
            autoPostEnabled: twitterAutoPostEnabledDraft,
          }),
        })) as { settings?: TwitterStatus['settings'] }

        setTwitterStatus((previous) => ({
          ok: true,
          connected: previous?.connected ?? false,
          connection: previous?.connection ?? null,
          settings: {
            autoPostEnabled: data.settings?.autoPostEnabled ?? twitterAutoPostEnabledDraft,
            template,
            discordWebhookUrl: data.settings?.discordWebhookUrl ?? previous?.settings.discordWebhookUrl ?? null,
            lastPostedGroupId: data.settings?.lastPostedGroupId ?? previous?.settings.lastPostedGroupId ?? null,
            lastPostedMeasuredAt: data.settings?.lastPostedMeasuredAt ?? previous?.settings.lastPostedMeasuredAt ?? null,
            lastPostedTweetId: data.settings?.lastPostedTweetId ?? previous?.settings.lastPostedTweetId ?? null,
            lastPostedTweetAt: data.settings?.lastPostedTweetAt ?? previous?.settings.lastPostedTweetAt ?? null,
          },
        }))
        setTwitterTemplateDraft(template)
        setIsTwitterTemplateDialogOpen(false)
        showToast(activeLanguage === 'ja' ? 'X投稿テンプレートを保存しました。' : 'Saved the X post template.', 'success')
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : activeLanguage === 'ja'
              ? 'X投稿テンプレートの保存に失敗しました。'
              : 'Failed to save the X post template.'
        showToast(message, 'error')
      } finally {
        setIsTwitterTemplateSaving(false)
      }
    },
    [activeLanguage, requestWithAuth, showToast, twitterAutoPostEnabledDraft, twitterTemplateDraft],
  )

  const handleSaveDiscordSettings = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      setIsDiscordSettingsSaving(true)
      try {
        const data = (await requestWithAuth('/api/admin/twitter/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template: twitterStatus?.settings.template || DEFAULT_TWITTER_TEMPLATE,
            autoPostEnabled: twitterStatus?.settings.autoPostEnabled ?? true,
            discordWebhookUrl: discordWebhookUrlDraft.trim(),
          }),
        })) as { settings?: TwitterStatus['settings'] }

        setTwitterStatus((previous) => ({
          ok: true,
          connected: previous?.connected ?? false,
          connection: previous?.connection ?? null,
          settings: {
            autoPostEnabled: data.settings?.autoPostEnabled ?? previous?.settings.autoPostEnabled ?? true,
            template: data.settings?.template ?? previous?.settings.template ?? DEFAULT_TWITTER_TEMPLATE,
            discordWebhookUrl: data.settings?.discordWebhookUrl ?? (discordWebhookUrlDraft.trim() || null),
            lastPostedGroupId: data.settings?.lastPostedGroupId ?? previous?.settings.lastPostedGroupId ?? null,
            lastPostedMeasuredAt: data.settings?.lastPostedMeasuredAt ?? previous?.settings.lastPostedMeasuredAt ?? null,
            lastPostedTweetId: data.settings?.lastPostedTweetId ?? previous?.settings.lastPostedTweetId ?? null,
            lastPostedTweetAt: data.settings?.lastPostedTweetAt ?? previous?.settings.lastPostedTweetAt ?? null,
          },
        }))
        setDiscordWebhookUrlDraft(discordWebhookUrlDraft.trim())
        setIsDiscordSettingsDialogOpen(false)
        showToast(activeLanguage === 'ja' ? 'Discord通知設定を保存しました。' : 'Saved the Discord notification settings.', 'success')
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : activeLanguage === 'ja'
              ? 'Discord通知設定の保存に失敗しました。'
              : 'Failed to save the Discord notification settings.'
        showToast(message, 'error')
      } finally {
        setIsDiscordSettingsSaving(false)
      }
    },
    [activeLanguage, discordWebhookUrlDraft, requestWithAuth, showToast, twitterStatus],
  )

  const handleTestDiscordSettings = useCallback(async () => {
    setIsDiscordSettingsTesting(true)
    try {
      await requestWithAuth('/api/admin/twitter/discord/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordWebhookUrl: discordWebhookUrlDraft.trim(),
        }),
      })
      showToast(activeLanguage === 'ja' ? 'Discordへテスト通知を送信しました。' : 'Sent a test notification to Discord.', 'success')
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Discordへのテスト通知送信に失敗しました。'
            : 'Failed to send a test notification to Discord.'
      showToast(message, 'error')
    } finally {
      setIsDiscordSettingsTesting(false)
    }
  }, [activeLanguage, discordWebhookUrlDraft, requestWithAuth, showToast])

  const handleTestTwitterPost = useCallback(async () => {
    const template = twitterTemplateDraft.trim()
    if (!template) {
      showToast(activeLanguage === 'ja' ? '投稿テンプレートを入力してください。' : 'Please enter a post template.', 'error')
      return
    }

    setIsTwitterTestPosting(true)
    try {
      const data = (await requestWithAuth('/api/admin/twitter/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })) as { mode?: 'with_image' | 'text_only' }
      showToast(
        data.mode === 'text_only'
          ? activeLanguage === 'ja'
            ? '画像添付に失敗したため、テキストのみでテスト投稿しました。'
            : 'The test post was sent as text only because the chart image upload failed.'
          : activeLanguage === 'ja'
            ? '画像付きでXへテスト投稿しました。'
            : 'Sent a test post with the chart image to X.',
        data.mode === 'text_only' ? 'info' : 'success',
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? 'Xテスト投稿に失敗しました。'
            : 'Failed to send a test post to X.'
      showToast(message, 'error')
    } finally {
      setIsTwitterTestPosting(false)
    }
  }, [activeLanguage, requestWithAuth, showToast, twitterTemplateDraft])

  const handleTwitterLatestPost = useCallback(async () => {
    const template = twitterTemplateDraft.trim()
    if (!template) {
      showToast(activeLanguage === 'ja' ? '投稿テンプレートを入力してください。' : 'Please enter a post template.', 'error')
      return
    }

    setIsTwitterLatestPosting(true)
    try {
      const data = (await requestWithAuth('/api/admin/twitter/post-latest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template }),
      })) as { mode?: 'with_image' | 'text_only' }
      await loadTwitterStatus()
      showToast(
        data.mode === 'text_only'
          ? activeLanguage === 'ja'
            ? '画像添付に失敗したため、テキストのみで最新データを投稿しました。'
            : 'The latest data was posted as text only because the chart image upload failed.'
          : activeLanguage === 'ja'
            ? '最新のWithingsデータをXへ投稿しました。'
            : 'Posted the latest Withings data to X.',
        data.mode === 'text_only' ? 'info' : 'success',
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : activeLanguage === 'ja'
            ? '最新データのX投稿に失敗しました。'
            : 'Failed to post the latest data to X.'
      showToast(message, 'error')
    } finally {
      setIsTwitterLatestPosting(false)
    }
  }, [activeLanguage, loadTwitterStatus, requestWithAuth, showToast, twitterTemplateDraft])

  useEffect(() => {
    const url = new URL(window.location.href)
    const twitterError = url.searchParams.get('twitter_error')
    const twitterStatusQuery = url.searchParams.get('twitter')
    const hasTwitterPayload = Boolean(twitterError || twitterStatusQuery)

    if (!hasTwitterPayload) {
      return
    }

    if (twitterError) {
      showToast(getTwitterAuthErrorMessage(twitterError), 'error')
    } else if (twitterStatusQuery === 'connected') {
      setIsEditMode(true)
      showToast(activeLanguage === 'ja' ? 'Xログインが完了しました。' : 'X login completed.', 'success')
      void loadTwitterStatus()
    }

    setIsTwitterAuthBusy(false)

    url.searchParams.delete('twitter')
    url.searchParams.delete('twitter_error')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [activeLanguage, loadTwitterStatus, setIsEditMode, showToast])

  useEffect(() => {
    if (!accessToken) {
      setTwitterStatus(null)
      setTwitterTemplateDraft(DEFAULT_TWITTER_TEMPLATE)
      setTwitterAutoPostEnabledDraft(true)
      setDiscordWebhookUrlDraft('')
      setIsTwitterTemplateDialogOpen(false)
      setIsDiscordSettingsDialogOpen(false)
      setIsDiscordSettingsTesting(false)
      return
    }

    void loadTwitterStatus()
  }, [accessToken, loadTwitterStatus])

  return {
    twitterStatus,
    isTwitterStatusLoading,
    isTwitterAuthBusy,
    isTwitterTemplateDialogOpen,
    isDiscordSettingsDialogOpen,
    twitterTemplateDraft,
    setTwitterTemplateDraft,
    twitterAutoPostEnabledDraft,
    setTwitterAutoPostEnabledDraft,
    discordWebhookUrlDraft,
    setDiscordWebhookUrlDraft,
    isTwitterTemplateSaving,
    isDiscordSettingsSaving,
    isDiscordSettingsTesting,
    isTwitterLatestPosting,
    isTwitterTestPosting,
    twitterChartPreviewVersion,
    setTwitterChartPreviewVersion,
    twitterAccountLabel,
    twitterLastPostedLabel,
    twitterTemplatePlaceholders,
    twitterTemplateValues,
    twitterTemplatePreview,
    twitterChartPreviewUrl,
    loadTwitterStatus,
    handleTwitterConnect,
    handleOpenTwitterTemplateDialog,
    handleCloseTwitterTemplateDialog,
    handleOpenDiscordSettingsDialog,
    handleCloseDiscordSettingsDialog,
    handleInsertTwitterPlaceholder,
    handleSaveTwitterTemplate,
    handleSaveDiscordSettings,
    handleTestDiscordSettings,
    handleTwitterLatestPost,
    handleTestTwitterPost,
  }
}
