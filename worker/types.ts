export interface Env {
  ASSETS: Fetcher
  DB: D1Database
  ACCESS_TOKEN_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  ALLOWED_GITHUB_LOGINS: string
  APP_ORIGIN?: string
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
  category: string
  imageUrl: string | null
  imageUrls: string[]
  imageFit: 'cover' | 'contain'
  linkUrl: string | null
  description: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}
