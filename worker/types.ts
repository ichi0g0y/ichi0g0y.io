export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  IMAGE_BUCKET: R2Bucket
  ACCESS_TOKEN_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ALLOWED_GITHUB_LOGINS: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  APP_ORIGIN?: string
  R2_PUBLIC_BASE_URL?: string
  WITHINGS_CLIENT_ID?: string
  WITHINGS_CLIENT_SECRET?: string
  WITHINGS_NOTIFY_SECRET?: string
  WITHINGS_PUBLIC_ORIGIN?: string
  WITHINGS_CALLBACK_URL?: string
  WITHINGS_NOTIFY_CALLBACK_URL?: string
  WITHINGS_OAUTH_SCOPE?: string
  WITHINGS_USER_HEIGHT_M?: string
}

export interface AccessTokenPayload {
  sid: string
  email: string
  iat: number
  exp: number
}

export interface AuthContext {
  sessionId: string
  email: string
}

export interface GearItem {
  id: number
  title: string
  titleEn: string | null
  category: string
  categoryEn: string | null
  imageUrl: string | null
  imageUrls: string[]
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  descriptionEn: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}
