import type { AppLocale, GearItem } from './types'

export function getGreetingByHour(date: Date, locale: AppLocale) {
  const hour = date.getHours()

  if (locale === 'en') {
    if (hour >= 4 && hour < 11) {
      return 'Good morning'
    }
    if (hour >= 11 && hour < 18) {
      return 'Hello'
    }
    return 'Good evening'
  }

  if (hour >= 4 && hour < 11) {
    return 'おはようございます'
  }

  if (hour >= 11 && hour < 18) {
    return 'こんにちは'
  }

  return 'こんばんは'
}

export function createIntroMessage(locale: AppLocale) {
  const greeting = getGreetingByHour(new Date(), locale)

  if (locale === 'en') {
    return `${greeting},\n\nI'm ICH(ichi).\n\nI'm a casual programmer based in Hyogo, Japan. On GitHub, I build vibe-coded projects, and on Twitch I stream work chats, retro console mods, and various games from time to time.\n\nI like making things slowly and playing games lazily. Feel free to say hi anytime.`
  }

  return `${greeting}、\n\nICH (いち) ともうします。\n\n兵庫在住のライトプログラマー。GitHubではバイブコーディングを中心に制作し、Twitchでは作業雑談やレトロゲーム機の改造配信、各種ゲーム配信を不定期で行っています。\n\nゆるく作って、だらだら遊ぶのが好きです。気になったら気軽に声をかけてください。`
}

export function getAuthErrorMessage(errorCode: string) {
  switch (errorCode) {
    case 'oauth_denied':
      return 'GitHubログインがキャンセルされました。'
    case 'state_mismatch':
      return 'ログイン処理の整合性チェックに失敗しました。再試行してください。'
    case 'token_exchange_failed':
      return 'GitHubとの認証連携に失敗しました。'
    case 'github_user_failed':
      return 'GitHubアカウント情報の取得に失敗しました。'
    case 'forbidden_user':
      return 'このGitHubアカウントは管理モードに許可されていません。'
    default:
      return 'ログインに失敗しました。'
  }
}

export function getTwitterAuthErrorMessage(errorCode: string) {
  switch (errorCode) {
    case 'twitter_oauth_denied':
      return 'Xログインがキャンセルされました。'
    case 'twitter_state_mismatch':
      return 'Xログイン処理の整合性チェックに失敗しました。再試行してください。'
    case 'twitter_token_exchange_failed':
      return 'Xトークンの取得に失敗しました。'
    case 'twitter_config_error':
      return 'X OAuth の設定が不足しています。'
    default:
      return 'Xログインに失敗しました。'
  }
}

export function getWithingsErrorMessage(errorCode: string) {
  switch (errorCode) {
    case 'withings_oauth_denied':
      return 'Withings連携がキャンセルされました。'
    case 'withings_state_mismatch':
      return 'Withings連携の整合性チェックに失敗しました。再試行してください。'
    case 'withings_token_exchange_failed':
      return 'Withingsトークンの取得に失敗しました。'
    case 'withings_notify_subscribe_failed':
      return 'Withings通知(Webhook)の登録に失敗しました。計測データ同期は継続できます。'
    case 'withings_sync_failed':
      return 'Withingsデータの初回同期に失敗しました。'
    case 'withings_config_error':
      return 'Withingsの設定が不足しています。'
    default:
      return 'Withings連携に失敗しました。'
  }
}

export function normalizeImageFit(value: unknown): GearItem['imageFit'] {
  return value === 'cover' ? 'cover' : 'contain'
}

export function normalizeImageUrls(values: unknown, fallbackImageUrl: string | null) {
  const resolved = Array.isArray(values) ? values : []
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const value of resolved) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  const fallback = typeof fallbackImageUrl === 'string' ? fallbackImageUrl.trim() : ''
  if (fallback && !seen.has(fallback)) {
    normalized.unshift(fallback)
  }

  return normalized
}

export function normalizeGearItem(item: GearItem): GearItem {
  const imageUrls = normalizeImageUrls(item.imageUrls, item.imageUrl)
  return {
    ...item,
    titleEn: item.titleEn ?? null,
    categoryEn: item.categoryEn ?? null,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    imageFit: normalizeImageFit(item.imageFit),
    descriptionEn: item.descriptionEn ?? null,
  }
}
