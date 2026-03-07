export const WITHINGS_OAUTH_STATE_TTL_SEC = 60 * 10
export const ACCESS_TOKEN_REFRESH_MARGIN_SEC = 60
export const WITHINGS_AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2'
export const WITHINGS_OAUTH_URL = 'https://wbsapi.withings.net/v2/oauth2'
export const WITHINGS_NOTIFY_URL = 'https://wbsapi.withings.net/notify'
export const WITHINGS_MEASURE_URL = 'https://wbsapi.withings.net/measure'
export const WITHINGS_MEASURE_V2_URL = 'https://wbsapi.withings.net/v2/measure'
export const WITHINGS_SLEEP_V2_URL = 'https://wbsapi.withings.net/v2/sleep'
export const WITHINGS_HEART_V2_URL = 'https://wbsapi.withings.net/v2/heart'
export const WITHINGS_ANSWERS_V2_URL = 'https://wbsapi.withings.net/v2/answers'
export const DEFAULT_WITHINGS_OAUTH_SCOPE = 'user.metrics,user.activity,user.sleepevents'
export const WITHINGS_NOTIFY_APPLI_MEASURE = 1
export const WITHINGS_NOTIFY_APPLI_ACTIVITY = 16
export const WITHINGS_NOTIFY_APPLIS = [WITHINGS_NOTIFY_APPLI_MEASURE, WITHINGS_NOTIFY_APPLI_ACTIVITY]
export const WITHINGS_MEASURE_BASE_CATEGORIES = [1]
export const WITHINGS_RETENTION_DAYS = 90
export const WITHINGS_RETENTION_WINDOW_SEC = WITHINGS_RETENTION_DAYS * 24 * 60 * 60
export const WITHINGS_SYNC_OVERLAP_SEC = 2 * 24 * 60 * 60
export const WITHINGS_RECENT_WORKOUT_LIMIT = 3
export const WITHINGS_PAGINATION_MAX_LOOP = 1000
export const WITHINGS_INTRADAY_DATA_FIELDS =
  'steps,elevation,soft,moderate,intense,calories,distance,active,hr,spo2,rr,strokes,pool_laps,duration'
export const WITHINGS_SLEEP_DATA_FIELDS = 'hr,rr,snoring,sleep_state'
export const WITHINGS_WORKOUT_SUMMARY_BASE_PATHS = new Set(['id', 'category', 'startdate', 'enddate', 'date', 'timezone'])

export type WithingsTokenBody = {
  userid?: string | number
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number | string
}

export type WithingsApiPayload<TBody> = {
  status?: number
  error?: string
  body?: TBody
}

export type WithingsConnectionRow = {
  userid: string
  access_token: string
  refresh_token: string
  token_type: string | null
  scope: string | null
  access_expires_at: number
  height_m: number | null
  notify_callback_url: string | null
  notify_subscribed_at: number | null
  last_synced_at: number | null
  created_at: number
  updated_at: number
}

export type WithingsConnection = {
  userId: string
  accessToken: string
  refreshToken: string
  tokenType: string | null
  scope: string | null
  accessExpiresAt: number
  heightM: number | null
  notifyCallbackUrl: string | null
  notifySubscribedAt: number | null
  lastSyncedAt: number | null
}

export type WithingsMeasure = {
  type?: number
  unit?: number
  value?: number
}

export type WithingsMeasureGroup = {
  grpid?: number
  attrib?: number
  date?: number
  category?: number
  measures?: WithingsMeasure[]
}

export type WithingsMeasureBody = {
  measuregrps?: WithingsMeasureGroup[]
  more?: boolean
  offset?: number
}

export type WithingsActivityBody = {
  activities?: Array<Record<string, unknown>>
  workouts?: Array<Record<string, unknown>>
  series?: Array<Record<string, unknown>>
  more?: boolean
  offset?: number
}

export type WithingsSleepBody = {
  series?: Array<Record<string, unknown>>
  sleep?: Array<Record<string, unknown>>
  more?: boolean
  offset?: number
}

export type WithingsHeartBody = {
  series?: Array<Record<string, unknown>>
  more?: boolean
  offset?: number
  [key: string]: unknown
}

export type WithingsAnswersBody = {
  series?: Array<Record<string, unknown>>
  answers?: Array<Record<string, unknown>>
  more?: boolean
  offset?: number
}

export type WithingsNotificationPayload = {
  userId: string | null
  appli: number | null
  startDate: number | null
  endDate: number | null
  dateYmd: string | null
  raw: Record<string, string>
}

export type WithingsNotifySubscribeResult = {
  ok: boolean
  callbackUrl: string
  status: number | null
  error: string | null
  usedFallback: boolean
  subscribedApplis: number[]
  failedApplis: number[]
}

export type WithingsNotifyUnsubscribeResult = {
  ok: boolean
  callbackUrls: string[]
  status: number | null
  error: string | null
  unsubscribedApplis: number[]
  failedApplis: number[]
}

export type StructuredValueType = 'number' | 'string' | 'boolean' | 'null' | 'json'

export type StructuredValueEntry = {
  path: string
  valueType: StructuredValueType
  valueNumber: number | null
  valueText: string | null
  valueBoolean: number | null
}

export type WorkoutDetailMeta = {
  labelJa: string
  labelEn: string
  unit: string | null
}

export type WorkoutDetailPoint = {
  key: string
  labelJa: string
  labelEn: string
  unit: string | null
  value: number | null
  valueText: string | null
}

export const WORKOUT_DETAIL_META_BY_PATH: Record<string, WorkoutDetailMeta> = {
  'data.distance': { labelJa: '距離', labelEn: 'Distance', unit: 'm' },
  'data.manual_distance': { labelJa: '距離', labelEn: 'Distance', unit: 'm' },
  'data.calories': { labelJa: '消費カロリー', labelEn: 'Calories', unit: 'kcal' },
  'data.manual_calories': { labelJa: '消費カロリー', labelEn: 'Calories', unit: 'kcal' },
  'data.duration': { labelJa: '運動時間', labelEn: 'Duration', unit: 'sec' },
  'data.steps': { labelJa: '歩数', labelEn: 'Steps', unit: null },
  'data.intensity': { labelJa: '強度', labelEn: 'Intensity', unit: null },
  'data.elevation': { labelJa: '高度上昇', labelEn: 'Elevation Gain', unit: null },
  'data.strokes': { labelJa: 'ストローク', labelEn: 'Strokes', unit: null },
  'data.pool_laps': { labelJa: 'プール往復', labelEn: 'Pool Laps', unit: null },
  'data.hr_average': { labelJa: '平均心拍', labelEn: 'Average Heart Rate', unit: 'bpm' },
  'data.hr_min': { labelJa: '最小心拍', labelEn: 'Minimum Heart Rate', unit: 'bpm' },
  'data.hr_max': { labelJa: '最大心拍', labelEn: 'Maximum Heart Rate', unit: 'bpm' },
  'data.speed_average': { labelJa: '平均速度', labelEn: 'Average Speed', unit: null },
  'data.speed_max': { labelJa: '最高速度', labelEn: 'Max Speed', unit: null },
}

export const DEFAULT_WORKOUT_DETAIL_PATHS = [
  'data.distance',
  'data.calories',
  'data.duration',
  'data.steps',
  'data.intensity',
]

export const WORKOUT_DETAIL_PATHS_BY_CATEGORY_KEY: Record<string, string[]> = {
  walking_running: ['data.distance', 'data.steps', 'data.calories', 'data.duration', 'data.intensity'],
  run: ['data.distance', 'data.steps', 'data.calories', 'data.duration', 'data.intensity', 'data.hr_average', 'data.hr_max'],
  hiking: ['data.distance', 'data.elevation', 'data.steps', 'data.calories', 'data.duration'],
  cycling: ['data.distance', 'data.calories', 'data.duration', 'data.speed_average', 'data.speed_max'],
  indoor_cycling: ['data.calories', 'data.duration', 'data.hr_average', 'data.hr_max', 'data.intensity'],
  swimming: ['data.duration', 'data.distance', 'data.calories', 'data.pool_laps', 'data.strokes'],
  gaming: ['data.duration', 'data.calories', 'data.intensity', 'data.hr_average', 'data.hr_max'],
  fitness: ['data.duration', 'data.calories', 'data.intensity', 'data.hr_average', 'data.hr_max', 'data.steps'],
  yoga: ['data.duration', 'data.calories', 'data.intensity', 'data.hr_average'],
  meditation: ['data.duration', 'data.hr_average'],
  other: ['data.duration', 'data.calories', 'data.steps', 'data.distance', 'data.intensity'],
}
