import { ensureTwitterPostSettings } from './twitter-db'
import { JST_TIME_ZONE } from './twitter-types'
import type { Env } from './types'
import type { WorkoutDetailPoint, WithingsWorkoutForNotification } from './withings-types'

const DISCORD_WEBHOOK_HOSTS = new Set(['discord.com', 'canary.discord.com', 'ptb.discord.com'])
const DISCORD_CONTENT_MAX_LENGTH = 2000

export function normalizeDiscordWebhookUrl(rawUrl: string | null | undefined) {
  const value = rawUrl?.trim() || ''
  if (!value) {
    return null
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' || !DISCORD_WEBHOOK_HOSTS.has(parsed.hostname)) {
    return null
  }

  if (!/^\/api\/webhooks\/[^/]+\/[^/]+$/.test(parsed.pathname)) {
    return null
  }

  return parsed.toString()
}

function buildDiscordContent(title: string, lines: Array<string | null | undefined>) {
  const filteredLines = lines.map((line) => line?.trim() || '').filter(Boolean)
  const content = [`**${title}**`, ...filteredLines].join('\n')
  if (content.length <= DISCORD_CONTENT_MAX_LENGTH) {
    return content
  }
  return `${content.slice(0, DISCORD_CONTENT_MAX_LENGTH - 1)}…`
}

export function formatDiscordTimestamp(epochSec: number | null | undefined) {
  if (typeof epochSec !== 'number' || !Number.isFinite(epochSec)) {
    return null
  }

  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(epochSec * 1000))
}

function resolveDiscordEnvironmentOrigin(env: Env) {
  const candidates = [env.WITHINGS_PUBLIC_ORIGIN, env.APP_ORIGIN]
  for (const candidate of candidates) {
    const value = candidate?.trim() || ''
    if (value) {
      return value
    }
  }
  return null
}

export function resolveDiscordEnvironment(env: Env) {
  const origin = resolveDiscordEnvironmentOrigin(env)
  if (!origin) {
    return {
      label: 'unknown',
      origin: null,
    } as const
  }

  let hostname = ''
  try {
    hostname = new URL(origin).hostname
  } catch {
    return {
      label: 'unknown',
      origin,
    } as const
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return {
      label: 'local',
      origin,
    } as const
  }

  if (hostname.endsWith('.workers.dev')) {
    return {
      label: 'remote',
      origin,
    } as const
  }

  return {
    label: 'production',
    origin,
  } as const
}

export function buildDiscordEnvironmentLines(env: Env) {
  const environment = resolveDiscordEnvironment(env)
  return [
    `deployment: ${environment.label}`,
    environment.origin ? `origin: ${environment.origin}` : null,
  ]
}

function formatDiscordNumber(value: number) {
  return new Intl.NumberFormat('ja-JP', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

function formatDiscordDistanceMeters(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  if (value >= 1000) {
    return `${formatDiscordNumber(value / 1000)} km`
  }
  return `${formatDiscordNumber(value)} m`
}

function formatDiscordCalories(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return `${formatDiscordNumber(value)} kcal`
}

function formatDiscordDuration(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }

  const totalSeconds = Math.trunc(value)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}時間${minutes}分`
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分`
  }
  return `${seconds}秒`
}

function formatWorkoutDetailValue(detail: WorkoutDetailPoint) {
  if (detail.key === 'data.distance' || detail.key === 'data.manual_distance') {
    return formatDiscordDistanceMeters(detail.value)
  }
  if (detail.key === 'data.calories' || detail.key === 'data.manual_calories') {
    return formatDiscordCalories(detail.value)
  }
  if (detail.key === 'data.duration') {
    return formatDiscordDuration(detail.value)
  }
  if (typeof detail.value === 'number' && Number.isFinite(detail.value)) {
    const renderedValue = formatDiscordNumber(detail.value)
    return detail.unit ? `${renderedValue} ${detail.unit}` : renderedValue
  }
  const valueText = detail.valueText?.trim() || ''
  return valueText || null
}

export function buildWithingsWorkoutDiscordLines(
  env: Env,
  workout: WithingsWorkoutForNotification,
): Array<string | null | undefined> {
  const details = workout.details
    .map((detail) => {
      const renderedValue = formatWorkoutDetailValue(detail)
      if (!renderedValue) {
        return null
      }
      return `${detail.labelJa}: ${renderedValue}`
    })
    .filter((line): line is string => Boolean(line))

  return [
    ...buildDiscordEnvironmentLines(env),
    'event: withings_workout_complete',
    `category: ${workout.workoutCategoryLabelJa}`,
    `startedAt: ${formatDiscordTimestamp(workout.startAt ?? workout.measuredAt) ?? '(unknown)'}`,
    workout.endAt ? `endedAt: ${formatDiscordTimestamp(workout.endAt) ?? '(unknown)'}` : null,
    workout.dataKey ? `dataKey: ${workout.dataKey}` : null,
    ...details,
  ]
}

export async function sendDiscordMessage(webhookUrl: string, title: string, lines: Array<string | null | undefined>) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      content: buildDiscordContent(title, lines),
      allowed_mentions: { parse: [] },
    }),
  }).catch((error) => {
    console.warn('[discord] webhook notify threw exception', error instanceof Error ? error.message : String(error))
    return null
  })

  if (!response) {
    return false
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.warn('[discord] webhook notify failed', {
      status: response.status,
      detail: detail.slice(0, 500),
    })
    return false
  }

  return true
}

export async function notifyDiscord(env: Env, title: string, lines: Array<string | null | undefined>) {
  const settings = await ensureTwitterPostSettings(env)
  const webhookUrl = normalizeDiscordWebhookUrl(settings.discordWebhookUrl)
  if (!webhookUrl) {
    return false
  }

  return sendDiscordMessage(webhookUrl, title, lines)
}
