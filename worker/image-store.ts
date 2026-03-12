import type { Env } from './types'
import { nowSeconds, sha256Hex } from './utils'

const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'
const NANOID_SIZE = 21
const IMAGE_FETCH_TIMEOUT_MS = 15_000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MANAGED_IMAGE_PATH = /^\/api\/images\/([A-Za-z0-9_-]{10,})$/
const NAKED_IMAGE_KEY_PATH = /^\/([A-Za-z0-9_-]{10,})$/

interface ImageRecord {
  id: string
  r2_key: string
}

interface ImageFetchResult {
  bytes: ArrayBuffer
  contentType: string
  etag: string | null
}

function createNanoId(size = NANOID_SIZE) {
  const random = new Uint8Array(size)
  crypto.getRandomValues(random)
  let id = ''

  for (let index = 0; index < random.length; index += 1) {
    id += NANOID_ALPHABET[random[index] % NANOID_ALPHABET.length]
  }

  return id
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256HexFromBytes(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return toHex(digest)
}

function normalizeImageUrls(values: string[]) {
  const unique: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    unique.push(trimmed)
  }

  return unique
}

async function ensureImagesSchema(env: Env) {
  await env.DB.prepare(
    `
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        r2_key TEXT NOT NULL UNIQUE,
        source_url TEXT NOT NULL,
        source_url_sha256 TEXT NOT NULL UNIQUE,
        content_sha256 TEXT,
        content_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        etag TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_checked_at INTEGER
      )
    `,
  ).run()

  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC)').run()
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_images_last_checked_at ON images(last_checked_at)').run()
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_images_content_sha256 ON images(content_sha256)').run()
}

function resolveManagedImageId(pathname: string) {
  const matched = pathname.match(MANAGED_IMAGE_PATH)
  return matched?.[1] ?? null
}

function resolveImageIdFromNakedPath(pathname: string) {
  const matched = pathname.match(NAKED_IMAGE_KEY_PATH)
  return matched?.[1] ?? null
}

function normalizePublicBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) {
    return null
  }
  return trimmed.replace(/\/+$/, '')
}

function resolvePublicOrigin(env: Env) {
  const baseUrl = normalizePublicBaseUrl(env.R2_PUBLIC_BASE_URL)
  if (!baseUrl) {
    return null
  }
  try {
    return new URL(baseUrl).origin
  } catch {
    return null
  }
}

function buildManagedImageUrl(env: Env, imageId: string, requestUrl: URL) {
  const baseUrl = normalizePublicBaseUrl(env.R2_PUBLIC_BASE_URL)
  if (!baseUrl) {
    return `/api/images/${imageId}`
  }
  return `${baseUrl}/${imageId}`
}

export function normalizeManagedImageUrlForResponse(env: Env, requestUrl: URL, value: string) {
  const imageId = resolveManagedImageIdFromAnyUrl(value, requestUrl, env)
  if (!imageId) {
    return value
  }
  return buildManagedImageUrl(env, imageId, requestUrl)
}

export function normalizeManagedImageUrlsForResponse(env: Env, requestUrl: URL, values: string[]) {
  return normalizeImageUrls(values.map((value) => normalizeManagedImageUrlForResponse(env, requestUrl, value)))
}

function resolveManagedImageIdFromAnyUrl(value: string, requestUrl: URL, env: Env) {
  const directManagedPathId = resolveManagedImageId(value)
  if (directManagedPathId) {
    return directManagedPathId
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  if (parsed.origin === requestUrl.origin) {
    const sameOriginManagedId = resolveManagedImageId(parsed.pathname)
    if (sameOriginManagedId) {
      return sameOriginManagedId
    }
  }

  const publicOrigin = resolvePublicOrigin(env)
  if (publicOrigin && parsed.origin === publicOrigin) {
    const publicKeyId = resolveImageIdFromNakedPath(parsed.pathname)
    if (publicKeyId) {
      return publicKeyId
    }
  }

  return null
}

async function fetchImageFromSource(sourceUrl: string): Promise<ImageFetchResult> {
  const abortController = new AbortController()
  const timeout = setTimeout(() => {
    abortController.abort('timeout')
  }, IMAGE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: abortController.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`画像取得に失敗しました: ${response.status}`)
    }

    const rawContentType = response.headers.get('content-type') ?? ''
    const contentType = rawContentType.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!contentType.startsWith('image/')) {
      throw new Error(`画像以外のContent-Typeです: ${contentType || 'unknown'}`)
    }

    const contentLengthRaw = response.headers.get('content-length')
    const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : Number.NaN
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error(`画像サイズが上限を超えています: ${contentLength}`)
    }

    const bytes = await response.arrayBuffer()
    if (bytes.byteLength < 1) {
      throw new Error('画像データが空です')
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`画像サイズが上限を超えています: ${bytes.byteLength}`)
    }

    return {
      bytes,
      contentType,
      etag: response.headers.get('etag'),
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function backupExternalImage(env: Env, sourceUrl: string, requestUrl: URL) {
  const sourceUrlHash = await sha256Hex(sourceUrl)
  const now = nowSeconds()

  const existing = await env.DB.prepare('SELECT id, r2_key FROM images WHERE source_url_sha256 = ?1 LIMIT 1')
    .bind(sourceUrlHash)
    .first<ImageRecord>()

  if (existing) {
    return buildManagedImageUrl(env, existing.id, requestUrl)
  }

  const fetched = await fetchImageFromSource(sourceUrl)
  const contentHash = await sha256HexFromBytes(fetched.bytes)
  const imageId = createNanoId()
  const r2Key = imageId

  await env.IMAGE_BUCKET.put(r2Key, fetched.bytes, {
    httpMetadata: {
      contentType: fetched.contentType,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      sourceUrl,
      sourceUrlSha256: sourceUrlHash,
      contentSha256: contentHash,
    },
  })

  await env.DB.prepare(
    `
      INSERT INTO images (
        id,
        r2_key,
        source_url,
        source_url_sha256,
        content_sha256,
        content_type,
        byte_size,
        width,
        height,
        etag,
        created_at,
        updated_at,
        last_checked_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, ?10, ?11)
    `,
  )
    .bind(imageId, r2Key, sourceUrl, sourceUrlHash, contentHash, fetched.contentType, fetched.bytes.byteLength, fetched.etag, now, now, now)
    .run()

  return buildManagedImageUrl(env, imageId, requestUrl)
}

export async function backupImageUrls(env: Env, request: Request, imageUrls: string[]) {
  if (imageUrls.length < 1) {
    return imageUrls
  }

  try {
    await ensureImagesSchema(env)
    const nextUrls: string[] = []
    const requestUrl = new URL(request.url)

    for (const source of imageUrls) {
      const trimmed = source.trim()
      if (!trimmed) {
        continue
      }
      const managedPathId = resolveManagedImageIdFromAnyUrl(trimmed, requestUrl, env)
      if (managedPathId) {
        nextUrls.push(buildManagedImageUrl(env, managedPathId, requestUrl))
        continue
      }

      let target: URL
      try {
        target = new URL(trimmed)
      } catch {
        nextUrls.push(trimmed)
        continue
      }

      if (!['http:', 'https:'].includes(target.protocol)) {
        nextUrls.push(trimmed)
        continue
      }

      try {
        const backedUpUrl = await backupExternalImage(env, target.toString(), requestUrl)
        nextUrls.push(backedUpUrl)
      } catch (error) {
        console.warn('画像バックアップに失敗しました', {
          sourceUrl: target.toString(),
          error: error instanceof Error ? error.message : String(error),
        })
        nextUrls.push(target.toString())
      }
    }

    return normalizeImageUrls(nextUrls)
  } catch (error) {
    console.warn('画像バックアップ処理の初期化に失敗しました', {
      error: error instanceof Error ? error.message : String(error),
    })
    return normalizeImageUrls(imageUrls)
  }
}

export async function handleGetImageById(request: Request, env: Env) {
  const url = new URL(request.url)
  const matched = url.pathname.match(MANAGED_IMAGE_PATH)
  const imageId = matched?.[1]
  if (!imageId) {
    return new Response('Not Found', { status: 404 })
  }

  await ensureImagesSchema(env)

  const row = await env.DB.prepare('SELECT r2_key, content_type, source_url FROM images WHERE id = ?1 LIMIT 1')
    .bind(imageId)
    .first<{ r2_key: string; content_type: string; source_url: string }>()

  if (!row) {
    return new Response('Not Found', { status: 404 })
  }

  const object = await env.IMAGE_BUCKET.get(row.r2_key)
  if (!object || !object.body) {
    // 本番環境では自己修復をスキップし、R2欠落時は404を返す
    if (env.R2_PUBLIC_BASE_URL) {
      return new Response('Not Found', { status: 404 })
    }
    try {
      // ローカル開発時にR2オブジェクトが欠けても source_url から自己修復する。
      const fetched = await fetchImageFromSource(row.source_url)
      await env.IMAGE_BUCKET.put(row.r2_key, fetched.bytes, {
        httpMetadata: {
          contentType: fetched.contentType,
          cacheControl: 'public, max-age=31536000, immutable',
        },
      })
      const now = nowSeconds()
      await env.DB.prepare(
        `
          UPDATE images
          SET content_type = ?1,
              byte_size = ?2,
              etag = ?3,
              updated_at = ?4,
              last_checked_at = ?5
          WHERE id = ?6
        `,
      )
        .bind(fetched.contentType, fetched.bytes.byteLength, fetched.etag, now, now, imageId)
        .run()

      const headers = new Headers()
      headers.set('Content-Type', fetched.contentType)
      headers.set('Cache-Control', 'public, max-age=31536000, immutable')
      if (fetched.etag) {
        headers.set('ETag', fetched.etag)
      }
      return new Response(fetched.bytes, { status: 200, headers })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  }

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('Content-Type', headers.get('Content-Type') ?? row.content_type)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', object.httpEtag)

  return new Response(object.body, { status: 200, headers })
}
