// Twitter連携の公開APIハンドラ

import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, parseCookies, randomToken, readJsonBody } from './utils'
import { formatDiscordTimestamp, normalizeDiscordWebhookUrl, notifyDiscord, sendDiscordMessage } from './discord-notify'
import type { TwitterStatusResponse } from './twitter-types'
import { TWITTER_TEMPLATE_MAX_LENGTH } from './twitter-types'
import { getStoredTwitterConnection, ensureTwitterPostSettings, upsertTwitterConnection } from './twitter-db'
import {
  validateTwitterOAuthConfig,
  getTwitterClientId,
  getTwitterOAuthScope,
  getTwitterCallbackUrl,
  buildTwitterStateCookie,
  buildTwitterCodeVerifierCookie,
  getClearTwitterCookies,
  getPostAuthRedirectUrl,
  createCodeChallenge,
  exchangeTwitterAuthorizationCode,
  fetchTwitterUser,
  redirectResponse,
} from './twitter-oauth'
import { createTwitterPost } from './twitter-post'
import { getStoredConnection as getStoredWithingsConnection } from './withings-sync'
export { postLatestWithingsMeasurementTweet } from './twitter-post'

async function notifyTwitterSuccess(
  env: Env,
  event: 'manual_latest_post' | 'test_post',
  data: { tweetId: string | null; mode: 'with_image' | 'text_only' },
) {
  await notifyDiscord(env, 'X投稿成功', [
    `event: ${event}`,
    `tweetId: ${data.tweetId ?? '(unknown)'}`,
    `mode: ${data.mode}`,
    `postedAt: ${formatDiscordTimestamp(nowSeconds()) ?? '(unknown)'}`,
  ])
}

async function notifyTwitterError(
  env: Env,
  event: string,
  message: string,
  details: Array<string | null | undefined> = [],
) {
  await notifyDiscord(env, 'X関連エラー', [`event: ${event}`, `message: ${message}`, ...details])
}

export async function handleTwitterOAuthStart(request: Request, env: Env) {
  const configError = validateTwitterOAuthConfig(env)
  if (configError) {
    return errorResponse(configError, 500)
  }

  const clientId = getTwitterClientId(env)
  const state = randomToken(24)
  const codeVerifier = randomToken(48)
  const codeChallenge = await createCodeChallenge(codeVerifier)
  const authorizeUrl = new URL('https://x.com/i/oauth2/authorize')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', getTwitterCallbackUrl(request, env))
  authorizeUrl.searchParams.set('scope', getTwitterOAuthScope(env))
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  const response = jsonResponse({
    ok: true,
    authorizeUrl: authorizeUrl.toString(),
    callbackUrl: getTwitterCallbackUrl(request, env),
    scope: getTwitterOAuthScope(env),
  })
  response.headers.append('Set-Cookie', buildTwitterStateCookie(state, request))
  response.headers.append('Set-Cookie', buildTwitterCodeVerifierCookie(codeVerifier, request))
  return response
}

export async function handleTwitterOAuthCallback(request: Request, env: Env) {
  const configError = validateTwitterOAuthConfig(env)
  if (configError) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_config_error'),
      getClearTwitterCookies(request),
    )
  }

  const url = new URL(request.url)
  const oauthError = url.searchParams.get('error')
  if (oauthError) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_oauth_denied'),
      getClearTwitterCookies(request),
    )
  }

  const state = (url.searchParams.get('state') ?? '').trim()
  const code = (url.searchParams.get('code') ?? '').trim()
  const cookies = parseCookies(request)
  const stateCookie = cookies.get('twitter_oauth_state')
  const codeVerifier = cookies.get('twitter_oauth_code_verifier')
  if (!state || !code || !stateCookie || !codeVerifier || state !== stateCookie) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_state_mismatch'),
      getClearTwitterCookies(request),
    )
  }

  const tokenBody = await exchangeTwitterAuthorizationCode(code, codeVerifier, request, env)
  if (!tokenBody?.access_token) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_token_exchange_failed'),
      getClearTwitterCookies(request),
    )
  }

  const user = await fetchTwitterUser(tokenBody.access_token)
  const previousConnection = await getStoredTwitterConnection(env)
  const storedConnection = await upsertTwitterConnection(env, tokenBody, user, previousConnection)
  if (!storedConnection) {
    return redirectResponse(
      getPostAuthRedirectUrl(request, env, undefined, 'twitter_token_exchange_failed'),
      getClearTwitterCookies(request),
    )
  }

  await ensureTwitterPostSettings(env)
  return redirectResponse(getPostAuthRedirectUrl(request, env, 'connected'), getClearTwitterCookies(request))
}

export async function handleTwitterStatus(env: Env) {
  const settings = await ensureTwitterPostSettings(env)
  const connection = await getStoredTwitterConnection(env)

  return jsonResponse({
    ok: true,
    connected: Boolean(connection),
    connection: connection
      ? {
          userId: connection.userId,
          username: connection.username,
          name: connection.name,
          scope: connection.scope,
          accessExpiresAt: connection.accessExpiresAt,
          updatedAt: connection.updatedAt,
        }
      : null,
    settings: {
      autoPostEnabled: settings.autoPostEnabled,
      template: settings.template,
      discordWebhookUrl: settings.discordWebhookUrl,
      lastPostedGroupId: settings.lastPostedGroupId,
      lastPostedMeasuredAt: settings.lastPostedMeasuredAt,
      lastPostedTweetId: settings.lastPostedTweetId,
      lastPostedTweetAt: settings.lastPostedTweetAt,
    },
  } satisfies TwitterStatusResponse)
}

export async function handleTwitterSettingsUpdate(request: Request, env: Env) {
  const body = await readJsonBody<{ template?: string; autoPostEnabled?: boolean; discordWebhookUrl?: string | null }>(request)
  const template = body?.template?.trim() ?? ''
  const autoPostEnabled = body?.autoPostEnabled !== false
  const discordWebhookUrlProvided = body?.discordWebhookUrl !== undefined
  const discordWebhookUrlInput = body?.discordWebhookUrl?.trim() || ''
  if (!template) {
    return errorResponse('投稿テンプレートを入力してください', 400)
  }
  if (template.length > TWITTER_TEMPLATE_MAX_LENGTH) {
    return errorResponse('投稿テンプレートが長すぎます', 400)
  }

  const now = nowSeconds()
  const existing = await ensureTwitterPostSettings(env)
  const discordWebhookUrl = discordWebhookUrlProvided
    ? (discordWebhookUrlInput ? normalizeDiscordWebhookUrl(discordWebhookUrlInput) : null)
    : existing.discordWebhookUrl
  if (discordWebhookUrlProvided && discordWebhookUrlInput && !discordWebhookUrl) {
    return errorResponse('Discord Webhook URL の形式が不正です', 400)
  }
  await env.DB.prepare(
    `
      INSERT INTO twitter_post_settings (
        id, auto_post_enabled, template_text, discord_webhook_url, last_posted_grpid, last_posted_measured_at,
        last_posted_tweet_id, last_posted_tweet_at, created_at, updated_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(id) DO UPDATE SET
        auto_post_enabled = excluded.auto_post_enabled,
        template_text = excluded.template_text,
        discord_webhook_url = excluded.discord_webhook_url,
        updated_at = excluded.updated_at
    `,
  )
    .bind(
      1,
      autoPostEnabled ? 1 : 0,
      template,
      discordWebhookUrl,
      existing.lastPostedGroupId,
      existing.lastPostedMeasuredAt,
      existing.lastPostedTweetId,
      existing.lastPostedTweetAt,
      existing.createdAt,
      now,
    )
    .run()

  return jsonResponse({
    ok: true,
    settings: {
      autoPostEnabled,
      template,
      discordWebhookUrl,
      lastPostedGroupId: existing.lastPostedGroupId,
      lastPostedMeasuredAt: existing.lastPostedMeasuredAt,
      lastPostedTweetId: existing.lastPostedTweetId,
      lastPostedTweetAt: existing.lastPostedTweetAt,
    },
  })
}

export async function handleDiscordTestNotification(request: Request, _env: Env) {
  const body = await readJsonBody<{ discordWebhookUrl?: string | null }>(request)
  const discordWebhookUrlInput = body?.discordWebhookUrl?.trim() || ''
  const discordWebhookUrl = normalizeDiscordWebhookUrl(discordWebhookUrlInput)
  if (!discordWebhookUrl) {
    return errorResponse('Discord Webhook URL の形式が不正です', 400)
  }

  const sentAt = formatDiscordTimestamp(nowSeconds()) ?? '(unknown)'
  const sent = await sendDiscordMessage(discordWebhookUrl, 'Discord通知テスト', [
    'event: manual_test',
    `sentAt: ${sentAt}`,
    'message: Discord通知設定のテスト送信です。',
  ])
  if (!sent) {
    return errorResponse('Discordへのテスト通知送信に失敗しました', 502)
  }

  return jsonResponse({ ok: true, sentAt })
}

export async function handleTwitterTestPost(request: Request, env: Env) {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    await notifyTwitterError(env, 'test_post', 'X連携が未設定です')
    return errorResponse('X連携が未設定です', 400)
  }

  const body = await readJsonBody<{ template?: string }>(request)
  const settings = await ensureTwitterPostSettings(env)
  const template = body?.template?.trim() || settings.template
  if (!template) {
    await notifyTwitterError(env, 'test_post', '投稿テンプレートを入力してください')
    return errorResponse('投稿テンプレートを入力してください', 400)
  }

  const posted = await createTwitterPost(env, {
    template,
    ignoreAlreadyPosted: true,
    updatePostedMarker: false,
    prefix: '[TEST]',
    requireImage: true,
  })
  if (!posted.ok) {
    if (posted.reason === 'missing_tweet_write_scope') {
      await notifyTwitterError(env, 'test_post', 'X再認証を行って tweet.write 権限を付与してください', [`reason: ${posted.reason}`])
      return errorResponse('X再認証を行って tweet.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'missing_media_write_scope') {
      await notifyTwitterError(env, 'test_post', 'X再認証を行って media.write 権限を付与してください', [`reason: ${posted.reason}`])
      return errorResponse('X再認証を行って media.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'measurement_not_found') {
      await notifyTwitterError(env, 'test_post', 'テスト投稿に使えるWithings計測データがありません', [`reason: ${posted.reason}`])
      return errorResponse('テスト投稿に使えるWithings計測データがありません', 400, { reason: posted.reason })
    }
    if (posted.reason === 'tweet_too_long') {
      await notifyTwitterError(env, 'test_post', '投稿文が長すぎます', [`reason: ${posted.reason}`])
      return errorResponse('投稿文が長すぎます', 400, { reason: posted.reason })
    }
    await notifyTwitterError(env, 'test_post', 'Xテスト投稿に失敗しました', [`reason: ${posted.reason}`])
    return errorResponse('Xテスト投稿に失敗しました', 502, { reason: posted.reason })
  }

  await notifyTwitterSuccess(env, 'test_post', posted)
  return jsonResponse({ ok: true, tweetId: posted.tweetId, mode: posted.mode })
}

export async function handleTwitterLatestPost(request: Request, env: Env) {
  const connection = await getStoredTwitterConnection(env)
  if (!connection) {
    await notifyTwitterError(env, 'manual_latest_post', 'X連携が未設定です')
    return errorResponse('X連携が未設定です', 400)
  }

  const withingsConnection = await getStoredWithingsConnection(env)
  if (!withingsConnection) {
    await notifyTwitterError(env, 'manual_latest_post', 'Withings連携が未設定です')
    return errorResponse('Withings連携が未設定です', 400)
  }

  const body = await readJsonBody<{ template?: string }>(request)
  const settings = await ensureTwitterPostSettings(env)
  const template = body?.template?.trim() || settings.template
  if (!template) {
    await notifyTwitterError(env, 'manual_latest_post', '投稿テンプレートを入力してください')
    return errorResponse('投稿テンプレートを入力してください', 400)
  }

  const posted = await createTwitterPost(env, {
    template,
    withingsUserId: withingsConnection.userId,
    ignoreAlreadyPosted: false,
    updatePostedMarker: true,
    requireImage: true,
  })
  if (!posted.ok) {
    if (posted.reason === 'missing_tweet_write_scope') {
      await notifyTwitterError(env, 'manual_latest_post', 'X再認証を行って tweet.write 権限を付与してください', [`reason: ${posted.reason}`])
      return errorResponse('X再認証を行って tweet.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'missing_media_write_scope') {
      await notifyTwitterError(env, 'manual_latest_post', 'X再認証を行って media.write 権限を付与してください', [`reason: ${posted.reason}`])
      return errorResponse('X再認証を行って media.write 権限を付与してください', 400, { reason: posted.reason })
    }
    if (posted.reason === 'measurement_not_found') {
      await notifyTwitterError(env, 'manual_latest_post', '投稿できるWithings計測データがありません', [`reason: ${posted.reason}`])
      return errorResponse('投稿できるWithings計測データがありません', 400, { reason: posted.reason })
    }
    if (posted.reason === 'already_posted') {
      await notifyTwitterError(env, 'manual_latest_post', '最新の体重計測は既に投稿済みです', [`reason: ${posted.reason}`])
      return errorResponse('最新の体重計測は既に投稿済みです', 400, { reason: posted.reason })
    }
    if (posted.reason === 'tweet_too_long') {
      await notifyTwitterError(env, 'manual_latest_post', '投稿文が長すぎます', [`reason: ${posted.reason}`])
      return errorResponse('投稿文が長すぎます', 400, { reason: posted.reason })
    }
    await notifyTwitterError(env, 'manual_latest_post', '最新データのX投稿に失敗しました', [`reason: ${posted.reason}`])
    return errorResponse('最新データのX投稿に失敗しました', 502, { reason: posted.reason })
  }

  await notifyTwitterSuccess(env, 'manual_latest_post', posted)
  return jsonResponse({ ok: true, tweetId: posted.tweetId, mode: posted.mode })
}
