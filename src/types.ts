export type GearItem = {
  id: number
  title: string
  titleEn?: string | null
  category: string
  categoryEn?: string | null
  imageUrl: string | null
  imageUrls: string[]
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  descriptionEn?: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export type ToastTone = 'success' | 'error' | 'info'
export type AddDialogStep = 'url' | 'edit'

export type LinkPreviewData = {
  url?: string
  title?: string | null
  description?: string | null
  imageUrl?: string | null
  imageCandidates?: string[]
}

export type ToastState = {
  id: number
  message: string
  tone: ToastTone
}

export type ImageSize = {
  width: number
  height: number
}

export type AppLocale = 'ja' | 'en'

export type TwitterConnection = {
  userId: string
  username: string | null
  name: string | null
  scope: string | null
  accessExpiresAt: number | null
  updatedAt: number
}

export type TwitterPostSettings = {
  autoPostEnabled: boolean
  template: string
  lastPostedGroupId: number | null
  lastPostedMeasuredAt: number | null
  lastPostedTweetId: string | null
  lastPostedTweetAt: number | null
}

export type TwitterStatus = {
  ok: boolean
  connected: boolean
  connection: TwitterConnection | null
  settings: TwitterPostSettings
}

export type WithingsConnection = {
  userId: string
  scope: string | null
  accessExpiresAt: number
  notifyCallbackUrl: string | null
  notifySubscribedAt: number | null
  lastSyncedAt: number | null
}

export type WithingsMeasurement = {
  measuredAt: number
  weightKg: number | null
  bmi?: number | null
  fatRatio: number | null
  fatMassKg: number | null
  leanMassKg: number | null
}

export type WithingsWeightPoint = {
  measuredAt: number
  weightKg: number
  fatRatio?: number | null
  bmi?: number | null
}

export type WithingsMetricPoint = {
  typeId: number | null
  metricKey: string
  labelJa: string
  labelEn: string
  unit: string | null
  value: number | null
  valueText?: string | null
  measuredAt: number
}

export type WithingsWorkoutPoint = {
  dataKey: string
  measuredAt: number
  workoutId: number | null
  workoutCategoryId: number | null
  workoutCategoryKey: string | null
  workoutCategoryLabelJa: string
  workoutCategoryLabelEn: string
  dateYmd: string | null
  timezone: string | null
  startAt: number | null
  endAt: number | null
  durationSec: number | null
  distanceMeters: number | null
  caloriesKcal: number | null
  steps: number | null
  intensity: number | null
  details?: WithingsWorkoutDetailPoint[]
}

export type WithingsWorkoutDetailPoint = {
  key: string
  labelJa: string
  labelEn: string
  unit: string | null
  value: number | null
  valueText?: string | null
}

export type WithingsStatus = {
  ok: boolean
  connected: boolean
  connection: WithingsConnection | null
  latestMeasurement: WithingsMeasurement | null
  latestMetrics: WithingsMetricPoint[]
  recentWorkouts: WithingsWorkoutPoint[]
  recentWeights: WithingsWeightPoint[]
}
