import type { Env } from './types'
import { nowSeconds, randomToken, sha256Hex } from './utils'
import type {
  StructuredValueEntry,
  WithingsConnection,
  WithingsConnectionRow,
  WithingsMeasure,
  WorkoutDetailMeta,
} from './withings-types'
import {
  DEFAULT_WITHINGS_OAUTH_SCOPE,
  DEFAULT_WORKOUT_DETAIL_PATHS,
  WITHINGS_OAUTH_STATE_TTL_SEC,
  WITHINGS_RETENTION_WINDOW_SEC,
  WITHINGS_SYNC_OVERLAP_SEC,
  WITHINGS_WORKOUT_SUMMARY_BASE_PATHS,
  WORKOUT_DETAIL_META_BY_PATH,
  WORKOUT_DETAIL_PATHS_BY_CATEGORY_KEY,
} from './withings-types'


export function getAppOrigin(request: Request, env: Env) {
  if (env.APP_ORIGIN?.trim()) {
    return env.APP_ORIGIN.trim()
  }
  return new URL(request.url).origin
}

export function getWithingsPublicOrigin(request: Request, env: Env) {
  if (env.WITHINGS_PUBLIC_ORIGIN?.trim()) {
    return env.WITHINGS_PUBLIC_ORIGIN.trim()
  }
  return getAppOrigin(request, env)
}

export function getWithingsCallbackUrl(request: Request, env: Env) {
  if (env.WITHINGS_CALLBACK_URL?.trim()) {
    return env.WITHINGS_CALLBACK_URL.trim()
  }
  return new URL('/api/withings/auth/callback', getWithingsPublicOrigin(request, env)).toString()
}

export function appendWithingsNotifySecret(rawUrl: string, env: Env) {
  const notifyUrl = new URL(rawUrl)
  if (env.WITHINGS_NOTIFY_SECRET?.trim()) {
    notifyUrl.searchParams.set('token', env.WITHINGS_NOTIFY_SECRET.trim())
  }
  return notifyUrl.toString()
}

export function getWithingsNotifyCallbackUrl(request: Request, env: Env) {
  const callbackBase =
    env.WITHINGS_NOTIFY_CALLBACK_URL?.trim() ||
    new URL('/api/withings/notify', getWithingsPublicOrigin(request, env)).toString()
  return appendWithingsNotifySecret(callbackBase, env)
}

export function getWithingsOAuthScope(env: Env) {
  if (env.WITHINGS_OAUTH_SCOPE?.trim()) {
    return env.WITHINGS_OAUTH_SCOPE.trim()
  }
  return DEFAULT_WITHINGS_OAUTH_SCOPE
}

export function validateWithingsOAuthConfig(env: Env) {
  if (!env.WITHINGS_CLIENT_ID?.trim()) {
    return 'WITHINGS_CLIENT_ID が未設定です'
  }
  if (!env.WITHINGS_CLIENT_SECRET?.trim()) {
    return 'WITHINGS_CLIENT_SECRET が未設定です'
  }
  return null
}

export async function createSignedWithingsState(env: Env) {
  if (!env.ACCESS_TOKEN_SECRET?.trim()) {
    return randomToken(24)
  }
  const issuedAt = nowSeconds()
  const nonce = randomToken(18)
  const raw = `${issuedAt}.${nonce}`
  const signature = await sha256Hex(`${raw}:${env.ACCESS_TOKEN_SECRET}`)
  return `${raw}.${signature}`
}

export async function verifySignedWithingsState(state: string, env: Env) {
  if (!env.ACCESS_TOKEN_SECRET?.trim()) {
    return false
  }

  const parts = state.split('.')
  if (parts.length !== 3) {
    return false
  }

  const issuedAt = Number.parseInt(parts[0] ?? '', 10)
  const nonce = parts[1] ?? ''
  const signature = parts[2] ?? ''
  if (!Number.isFinite(issuedAt) || !nonce || !signature) {
    return false
  }

  const age = nowSeconds() - issuedAt
  if (age < 0 || age > WITHINGS_OAUTH_STATE_TTL_SEC) {
    return false
  }

  const raw = `${issuedAt}.${nonce}`
  const expectedSignature = await sha256Hex(`${raw}:${env.ACCESS_TOKEN_SECRET}`)
  return expectedSignature === signature
}

export function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === 'https:'
}

export function buildWithingsStateCookie(state: string, request: Request, maxAgeSec: number) {
  const segments = [
    `withings_oauth_state=${state}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/api/withings/auth',
    `Max-Age=${maxAgeSec}`,
  ]
  if (isSecureRequest(request)) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

export function clearWithingsStateCookie(request: Request) {
  const segments = ['withings_oauth_state=', 'HttpOnly', 'SameSite=Lax', 'Path=/api/withings/auth', 'Max-Age=0']
  if (isSecureRequest(request)) {
    segments.push('Secure')
  }
  return segments.join('; ')
}

export function toConnection(row: WithingsConnectionRow): WithingsConnection {
  return {
    userId: row.userid,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    tokenType: row.token_type,
    scope: row.scope,
    accessExpiresAt: row.access_expires_at,
    heightM: typeof row.height_m === 'number' && Number.isFinite(row.height_m) && row.height_m > 0 ? row.height_m : null,
    notifyCallbackUrl: row.notify_callback_url,
    notifySubscribedAt: row.notify_subscribed_at,
    lastSyncedAt: row.last_synced_at,
  }
}

export function redirectToApp(request: Request, env: Env, status?: string, errorCode?: string, extraCookies: string[] = []) {
  const url = new URL('/', getAppOrigin(request, env))
  if (status) {
    url.searchParams.set('withings', status)
  }
  if (errorCode) {
    url.searchParams.set('withings_error', errorCode)
  }
  const headers = new Headers({ Location: url.toString() })
  for (const cookie of extraCookies) {
    headers.append('Set-Cookie', cookie)
  }
  return new Response(null, { status: 302, headers })
}

export function parseExpiresIn(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 1) {
    return 0
  }
  return Math.floor(numberValue)
}

export function parseOptionalInteger(value: string | null | undefined) {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function toOptionalInteger(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return Math.trunc(value)
}

export function toOptionalNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value
}

export function resolveWithingsMeasureValue(measure: WithingsMeasure) {
  if (typeof measure.value !== 'number' || typeof measure.unit !== 'number') {
    return null
  }
  return measure.value * 10 ** measure.unit
}

export function getConfiguredHeightM(env: Env) {
  const configuredHeight = Number(env.WITHINGS_USER_HEIGHT_M ?? '')
  if (!Number.isFinite(configuredHeight) || configuredHeight <= 0) {
    return null
  }
  return configuredHeight
}

export function resolveHeightM(connection: WithingsConnection | null, env: Env) {
  if (connection?.heightM && Number.isFinite(connection.heightM) && connection.heightM > 0) {
    return connection.heightM
  }
  return getConfiguredHeightM(env)
}

export function calculateBmi(weightKg: number | null, heightM: number | null) {
  if (
    typeof weightKg !== 'number' ||
    !Number.isFinite(weightKg) ||
    typeof heightM !== 'number' ||
    !Number.isFinite(heightM) ||
    heightM <= 0
  ) {
    return null
  }
  return weightKg / (heightM * heightM)
}

export function toDateYmd(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10)
}

export function resolveWithingsRetentionStart(endDate: number) {
  return Math.max(1, endDate - WITHINGS_RETENTION_WINDOW_SEC)
}

export function resolveIncrementalSyncStart(lastSyncedAt: number | null, endDate: number) {
  const retentionStart = resolveWithingsRetentionStart(endDate)
  if (typeof lastSyncedAt === 'number' && lastSyncedAt > 0) {
    return Math.max(retentionStart, lastSyncedAt - WITHINGS_SYNC_OVERLAP_SEC)
  }
  return retentionStart
}

export function resolveSyncWindow(startDate: number | null, endDate: number | null, fallbackStart: number | null) {
  const now = nowSeconds()
  const resolvedEnd = typeof endDate === 'number' && endDate > 0 ? endDate : now
  const retentionStart = resolveWithingsRetentionStart(resolvedEnd)
  const resolvedStart =
    typeof startDate === 'number' && startDate > 0
      ? startDate
      : typeof fallbackStart === 'number' && fallbackStart > 0
        ? fallbackStart
        : retentionStart
  return {
    startDate: Math.max(retentionStart, Math.min(resolvedStart, resolvedEnd)),
    endDate: Math.max(1, resolvedEnd),
  }
}

export function parseUnixFromUnknown(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    if (value > 1_000_000_000_000) {
      return Math.floor(value / 1000)
    }
    return Math.floor(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    if (/^\d+$/.test(trimmed)) {
      const asInt = Number(trimmed)
      if (Number.isFinite(asInt) && asInt > 0) {
        if (asInt > 1_000_000_000_000) {
          return Math.floor(asInt / 1000)
        }
        return Math.floor(asInt)
      }
      return null
    }

    const parsedMs = Date.parse(trimmed)
    if (Number.isFinite(parsedMs) && parsedMs > 0) {
      return Math.floor(parsedMs / 1000)
    }
  }
  return null
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export function resolveMeasuredAtFromRecord(record: Record<string, unknown>) {
  const keys = ['date', 'startdate', 'enddate', 'modified', 'created', 'timestamp', 'start_time', 'end_time', 'measured_at']
  for (const key of keys) {
    const parsed = parseUnixFromUnknown(record[key])
    if (parsed) {
      return parsed
    }
  }

  const nestedKeys = ['ecg', 'raw']
  for (const nestedKey of nestedKeys) {
    const nested = toRecord(record[nestedKey])
    if (!nested) {
      continue
    }
    const parsed = resolveMeasuredAtFromRecord(nested)
    if (parsed) {
      return parsed
    }
  }

  return null
}

export function resolveHeartSignalId(record: Record<string, unknown>) {
  const keyCandidates = ['signalid', 'signal_id', 'ecgid', 'id']
  for (const key of keyCandidates) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value))
    }
  }
  const nestedEcg = toRecord(record.ecg)
  if (!nestedEcg) {
    return null
  }
  for (const key of keyCandidates) {
    const value = nestedEcg[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(Math.trunc(value))
    }
  }
  return null
}

export async function resolveRawDataKey(record: Record<string, unknown>, index: number, measuredAt: number | null) {
  const keyCandidates = [
    'id',
    'grpid',
    'date',
    'startdate',
    'enddate',
    'modified',
    'created',
    'start_time',
    'end_time',
    'signalid',
    'signal_id',
    'ecgid',
  ]
  const parts: string[] = []
  for (const key of keyCandidates) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}:${value.trim()}`)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      parts.push(`${key}:${Math.trunc(value)}`)
    }
  }
  if (parts.length > 0) {
    return parts.join('|')
  }

  const payloadHash = await sha256Hex(JSON.stringify(record))
  return `hash:${payloadHash}:idx:${index}:at:${measuredAt ?? 0}`
}

export function resolveNextOffset(currentOffset: number, nextOffsetValue: unknown, pageSize: number) {
  const nextOffset = Number(nextOffsetValue)
  if (Number.isFinite(nextOffset) && nextOffset > currentOffset) {
    return Math.trunc(nextOffset)
  }
  return currentOffset + Math.max(pageSize, 1)
}

export function toRecords(value: unknown, keyFieldForObject: string | null = null) {
  if (Array.isArray(value)) {
    const rows: Record<string, unknown>[] = []
    for (const row of value) {
      const record = toRecord(row)
      if (record) {
        rows.push(record)
      }
    }
    return rows
  }

  const objectValue = toRecord(value)
  if (!objectValue) {
    return [] as Record<string, unknown>[]
  }

  const rows: Record<string, unknown>[] = []
  for (const [key, row] of Object.entries(objectValue)) {
    const record = toRecord(row)
    if (!record) {
      continue
    }
    if (keyFieldForObject && typeof record[keyFieldForObject] === 'undefined') {
      rows.push({ [keyFieldForObject]: key, ...record })
    } else {
      rows.push(record)
    }
  }
  return rows
}

export function humanizeMetricPath(path: string) {
  return path
    .split('.')
    .map((part) => part.replaceAll('_', ' '))
    .join(' / ')
}

export function normalizeStructuredPath(path: string) {
  return path.replaceAll('"', '')
}

export function shouldRetainStructuredPath(source: string, path: string) {
  if (source !== 'measure.getworkouts') {
    return false
  }
  const normalizedPath = normalizeStructuredPath(path)
  if (normalizedPath.startsWith('data.')) {
    return true
  }
  return WITHINGS_WORKOUT_SUMMARY_BASE_PATHS.has(normalizedPath)
}

export function getWorkoutDetailMeta(path: string) {
  const known = WORKOUT_DETAIL_META_BY_PATH[path]
  if (known) {
    return known
  }

  const humanized = humanizeMetricPath(path.replace(/^data\./, ''))
  return {
    labelJa: humanized,
    labelEn: humanized,
    unit: null,
  }
}

export function getWorkoutDetailCanonicalPath(path: string) {
  if (path === 'data.manual_distance') {
    return 'data.distance'
  }
  if (path === 'data.manual_calories') {
    return 'data.calories'
  }
  return path
}

export function getWorkoutDetailPathPriority(path: string) {
  if (path === 'data.manual_distance' || path === 'data.manual_calories') {
    return 2
  }
  return 1
}

export function getOrderedWorkoutDetailPaths(categoryKey: string | null, availablePaths: string[]) {
  const normalizedCategoryKey = categoryKey?.trim() ?? ''
  const preferredPaths = WORKOUT_DETAIL_PATHS_BY_CATEGORY_KEY[normalizedCategoryKey] ?? DEFAULT_WORKOUT_DETAIL_PATHS
  const available = new Set(availablePaths)
  const used = new Set<string>()
  const ordered: string[] = []

  for (const path of preferredPaths) {
    if (!available.has(path) || used.has(path)) {
      continue
    }
    used.add(path)
    ordered.push(path)
  }

  const remaining = availablePaths.filter((path) => !used.has(path)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...remaining]
}

export function toFiniteNumber(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  return value
}

export function toFiniteInteger(value: unknown) {
  const numberValue = toFiniteNumber(value)
  if (numberValue === null) {
    return null
  }
  return Math.trunc(numberValue)
}

export function resolveWorkoutDataNumber(record: Record<string, unknown>, key: string) {
  const data = toRecord(record.data)
  if (!data) {
    return null
  }
  return toFiniteNumber(data[key])
}

export function flattenStructuredValueEntries(value: unknown, path: string, entries: StructuredValueEntry[]) {
  if (value === null) {
    entries.push({ path, valueType: 'null', valueNumber: null, valueText: null, valueBoolean: null })
    return
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return
    }
    entries.push({ path, valueType: 'number', valueNumber: value, valueText: null, valueBoolean: null })
    return
  }

  if (typeof value === 'string') {
    entries.push({ path, valueType: 'string', valueNumber: null, valueText: value, valueBoolean: null })
    return
  }

  if (typeof value === 'boolean') {
    entries.push({ path, valueType: 'boolean', valueNumber: null, valueText: null, valueBoolean: value ? 1 : 0 })
    return
  }

  if (Array.isArray(value)) {
    entries.push({
      path,
      valueType: 'json',
      valueNumber: null,
      valueText: JSON.stringify(value),
      valueBoolean: null,
    })
    return
  }

  const record = toRecord(value)
  if (!record) {
    return
  }

  const keys = Object.keys(record)
  if (keys.length < 1) {
    entries.push({
      path,
      valueType: 'json',
      valueNumber: null,
      valueText: JSON.stringify(record),
      valueBoolean: null,
    })
    return
  }

  for (const key of keys) {
    const childPath = path ? `${path}.${key}` : key
    flattenStructuredValueEntries(record[key], childPath, entries)
  }
}

export function buildStructuredValueEntries(payload: unknown) {
  const entries: StructuredValueEntry[] = []
  const root = toRecord(payload)
  if (!root) {
    flattenStructuredValueEntries(payload, '$', entries)
    return entries
  }
  for (const key of Object.keys(root)) {
    flattenStructuredValueEntries(root[key], key, entries)
  }
  return entries
}
