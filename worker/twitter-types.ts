// Twitter連携の型定義と定数

export const TWITTER_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize'
export const TWITTER_TOKEN_URL = 'https://api.x.com/2/oauth2/token'
export const TWITTER_ME_URL = 'https://api.x.com/2/users/me?user.fields=id,name,username'
export const TWITTER_CREATE_TWEET_URL = 'https://api.x.com/2/tweets'
export const TWITTER_MEDIA_UPLOAD_INITIALIZE_URL = 'https://api.x.com/2/media/upload/initialize'
export const OAUTH_STATE_TTL_SEC = 60 * 10
export const ACCESS_TOKEN_REFRESH_MARGIN_SEC = 60 * 5
export const DEFAULT_TWITTER_SCOPE = 'tweet.read tweet.write users.read offline.access media.write'
export const DEFAULT_TWITTER_POST_TEMPLATE = '体重 {{weight}}kg / 体脂肪率 {{fat_ratio}}% / BMI {{bmi}}\n{{measured_at}}'
export const TWITTER_TEMPLATE_MAX_LENGTH = 1000
export const TWITTER_POST_MAX_LENGTH = 280
export const JST_TIME_ZONE = 'Asia/Tokyo'

export type TwitterTokenResponse = {
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_in?: number
}

export type TwitterUser = {
  id?: string
  name?: string
  username?: string
}

export type TwitterUserResponse = {
  data?: TwitterUser
}

export type TwitterConnectionRow = {
  user_id: string
  username: string | null
  name: string | null
  access_token: string
  refresh_token: string | null
  token_type: string | null
  scope: string | null
  access_expires_at: number | null
  created_at: number
  updated_at: number
}

export type TwitterPostSettingsRow = {
  auto_post_enabled: number
  template_text: string
  last_posted_grpid: number | null
  last_posted_measured_at: number | null
  last_posted_tweet_id: string | null
  last_posted_tweet_at: number | null
  created_at: number
  updated_at: number
}

export type TwitterConnection = {
  userId: string
  username: string | null
  name: string | null
  accessToken: string
  refreshToken: string | null
  tokenType: string | null
  scope: string | null
  accessExpiresAt: number | null
  createdAt: number
  updatedAt: number
}

export type TwitterPostSettings = {
  autoPostEnabled: boolean
  template: string
  lastPostedGroupId: number | null
  lastPostedMeasuredAt: number | null
  lastPostedTweetId: string | null
  lastPostedTweetAt: number | null
  createdAt: number
  updatedAt: number
}

export type TwitterStatusResponse = {
  ok: true
  connected: boolean
  connection: {
    userId: string
    username: string | null
    name: string | null
    scope: string | null
    accessExpiresAt: number | null
    updatedAt: number
  } | null
  settings: {
    autoPostEnabled: boolean
    template: string
    lastPostedGroupId: number | null
    lastPostedMeasuredAt: number | null
    lastPostedTweetId: string | null
    lastPostedTweetAt: number | null
  }
}

export type WithingsMeasurementForTweet = {
  grpid: number
  measuredAt: number
  weightKg: number | null
  fatRatio: number | null
  bmi: number | null
}

export type CreateTwitterPostOptions = {
  template: string
  withingsUserId?: string | null
  targetGroupId?: number | null
  minMeasuredAt?: number | null
  maxMeasuredAt?: number | null
  ignoreAlreadyPosted?: boolean
  updatePostedMarker?: boolean
  prefix?: string
  requireImage?: boolean
}
