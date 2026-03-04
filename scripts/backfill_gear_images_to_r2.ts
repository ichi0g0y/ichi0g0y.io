import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Mode = 'local' | 'remote'

interface GearRow {
  id: number
  title: string
  image_url: string | null
  image_urls: string | null
}

interface ImageRow {
  id: string
  source_url_sha256: string
}

interface D1Result<T> {
  results?: T[]
  success?: boolean
}

const DATABASE_NAME = 'ichi0g0y-io'
const PROD_BUCKET_NAME = 'ichi0g0y-io'
const DEV_BUCKET_NAME = 'ichi0g0y-io'
const MANAGED_IMAGE_PATH = /^\/api\/images\/([A-Za-z0-9_-]{10,})$/
const NAKED_IMAGE_KEY_PATH = /^\/([A-Za-z0-9_-]{10,})$/
const PROD_PUBLIC_BASE_URL = 'https://s3.ichi0g0y.io'
const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-'
const NANOID_SIZE = 21
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const IMAGE_FETCH_TIMEOUT_MS = 15_000

function parseMode(args: string[]): Mode {
  return args.includes('--remote') ? 'remote' : 'local'
}

function parseEnv(args: string[]) {
  const envIndex = args.findIndex((arg) => arg === '--env')
  if (envIndex < 0) {
    return null
  }
  const env = args[envIndex + 1]
  return env?.trim() || null
}

function parseLimit(args: string[]) {
  const limitIndex = args.findIndex((arg) => arg === '--limit')
  if (limitIndex < 0) {
    return null
  }
  const raw = args[limitIndex + 1]
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null
  }
  return parsed
}

function sqlString(value: string | null) {
  if (value === null) {
    return 'NULL'
  }
  return `'${value.replaceAll("'", "''")}'`
}

function sha256Hex(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function createNanoId(size = NANOID_SIZE) {
  const bytes = randomBytes(size)
  let id = ''
  for (let index = 0; index < size; index += 1) {
    id += NANOID_ALPHABET[bytes[index] % NANOID_ALPHABET.length]
  }
  return id
}

function normalizeImageUrls(values: string[]) {
  const seen = new Set<string>()
  const normalized: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    normalized.push(trimmed)
  }

  return normalized
}

function parseStoredImageUrls(imageUrlsJson: string | null, fallbackImageUrl: string | null) {
  const values: string[] = []
  const seen = new Set<string>()

  const append = (raw: unknown) => {
    if (typeof raw !== 'string') {
      return
    }
    const trimmed = raw.trim()
    if (!trimmed || seen.has(trimmed)) {
      return
    }
    seen.add(trimmed)
    values.push(trimmed)
  }

  if (imageUrlsJson) {
    try {
      const parsed = JSON.parse(imageUrlsJson) as unknown
      if (Array.isArray(parsed)) {
        for (const value of parsed) {
          append(value)
        }
      }
    } catch {
      // ignore broken JSON and fallback to image_url
    }
  }

  append(fallbackImageUrl)
  return values
}

function resolvePublicBaseUrl(mode: Mode, env: string | null) {
  if (mode === 'local') {
    return null
  }
  if (env === 'dev') {
    return null
  }
  return PROD_PUBLIC_BASE_URL
}

function buildManagedImageUrl(imageId: string, mode: Mode, env: string | null) {
  const publicBaseUrl = resolvePublicBaseUrl(mode, env)
  if (!publicBaseUrl) {
    return `/api/images/${imageId}`
  }
  return `${publicBaseUrl}/${imageId}`
}

function resolveManagedImageIdFromValue(value: string, mode: Mode, env: string | null) {
  const directManaged = value.match(MANAGED_IMAGE_PATH)
  if (directManaged) {
    return directManaged[1]
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return null
  }

  const managedPath = parsed.pathname.match(MANAGED_IMAGE_PATH)
  if (managedPath) {
    return managedPath[1]
  }

  const publicBaseUrl = resolvePublicBaseUrl(mode, env)
  if (!publicBaseUrl) {
    return null
  }

  try {
    const publicOrigin = new URL(publicBaseUrl).origin
    if (parsed.origin !== publicOrigin) {
      return null
    }
  } catch {
    return null
  }

  const nakedId = parsed.pathname.match(NAKED_IMAGE_KEY_PATH)
  return nakedId?.[1] ?? null
}

function getWranglerBin() {
  return resolve(process.cwd(), 'node_modules/.bin/wrangler')
}

function runWrangler(args: string[], input?: Uint8Array) {
  const result = spawnSync(getWranglerBin(), args, {
    input,
    env: process.env,
    maxBuffer: 1024 * 1024 * 50,
  })

  const stdout = result.stdout ? result.stdout.toString() : ''
  const stderr = result.stderr ? result.stderr.toString() : ''
  if (result.status !== 0) {
    throw new Error(`wrangler command failed: ${args.join(' ')}\n${stderr || stdout}`)
  }

  return { stdout, stderr }
}

function runD1Query<T>(mode: Mode, env: string | null, sql: string) {
  const args = ['d1', 'execute', DATABASE_NAME, mode === 'remote' ? '--remote' : '--local', '--json', '--command', sql]
  if (env) {
    args.push('--env', env)
  }
  const { stdout } = runWrangler(args)
  const payload = JSON.parse(stdout) as Array<D1Result<T>>
  return payload[0] ?? {}
}

function runD1File(mode: Mode, env: string | null, filePath: string) {
  const args = ['d1', 'execute', DATABASE_NAME, mode === 'remote' ? '--remote' : '--local', '--file', filePath]
  if (env) {
    args.push('--env', env)
  }
  runWrangler(args)
}

function putR2Object(
  mode: Mode,
  env: string | null,
  bucketName: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const args = [
    'r2',
    'object',
    'put',
    `${bucketName}/${key}`,
    mode === 'remote' ? '--remote' : '--local',
    '--pipe',
    '--content-type',
    contentType,
    '--cache-control',
    'public, max-age=31536000, immutable',
  ]

  if (env) {
    args.push('--env', env)
  }

  runWrangler(args, bytes)
}

async function fetchImage(sourceUrl: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort('timeout'), IMAGE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`status=${response.status}`)
    }

    const rawContentType = response.headers.get('content-type') ?? ''
    const contentType = rawContentType.split(';')[0]?.trim().toLowerCase() ?? ''
    if (!contentType.startsWith('image/')) {
      throw new Error(`invalid content-type: ${contentType || 'unknown'}`)
    }

    const contentLengthRaw = response.headers.get('content-length')
    const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : Number.NaN
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error(`image too large: ${contentLength}`)
    }

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength < 1) {
      throw new Error('empty image bytes')
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`image too large: ${bytes.byteLength}`)
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

async function main() {
  const args = Bun.argv.slice(2)
  const mode = parseMode(args)
  const env = parseEnv(args)
  const limit = parseLimit(args)
  const bucketName = env === 'dev' ? DEV_BUCKET_NAME : PROD_BUCKET_NAME

  const ensureImagesSchemaSql = `
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
    );
    CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_images_last_checked_at ON images(last_checked_at);
    CREATE INDEX IF NOT EXISTS idx_images_content_sha256 ON images(content_sha256);
  `
  runD1Query(mode, env, ensureImagesSchemaSql)

  const limitClause = limit ? `LIMIT ${limit}` : ''
  const gearRows = (runD1Query<GearRow>(
    mode,
    env,
    `
      SELECT id, title, image_url, image_urls
      FROM gear_items
      ORDER BY id ASC
      ${limitClause}
    `,
  ).results ?? []) as GearRow[]

  const existingImageRows = (runD1Query<ImageRow>(
    mode,
    env,
    'SELECT id, source_url_sha256 FROM images ORDER BY created_at ASC, id ASC',
  ).results ?? []) as ImageRow[]

  const imageIdBySourceHash = new Map<string, string>()
  for (const row of existingImageRows) {
    if (!row?.id || !row?.source_url_sha256) {
      continue
    }
    imageIdBySourceHash.set(row.source_url_sha256, row.id)
  }

  console.log(
    `[start] mode=${mode} env=${env ?? '(default)'} bucket=${bucketName} gear_items=${gearRows.length} known_images=${imageIdBySourceHash.size}`,
  )

  const now = Math.floor(Date.now() / 1000)
  const insertImageStatements: string[] = []
  const updateGearStatements: string[] = []
  let migratedUrlCount = 0
  let reusedUrlCount = 0
  let skippedUrlCount = 0
  let failedUrlCount = 0
  let changedItemCount = 0

  for (const gear of gearRows) {
    const currentImageUrls = normalizeImageUrls(parseStoredImageUrls(gear.image_urls, gear.image_url))
    if (currentImageUrls.length < 1) {
      continue
    }

    const nextImageUrls: string[] = []

    for (const sourceValue of currentImageUrls) {
      const existingManagedImageId = resolveManagedImageIdFromValue(sourceValue, mode, env)
      if (existingManagedImageId) {
        nextImageUrls.push(buildManagedImageUrl(existingManagedImageId, mode, env))
        continue
      }

      let target: URL
      try {
        target = new URL(sourceValue)
      } catch {
        nextImageUrls.push(sourceValue)
        skippedUrlCount += 1
        continue
      }

      if (!['http:', 'https:'].includes(target.protocol)) {
        nextImageUrls.push(sourceValue)
        skippedUrlCount += 1
        continue
      }

      const normalizedSourceUrl = target.toString()
      const sourceHash = sha256Hex(normalizedSourceUrl)
      const existingImageId = imageIdBySourceHash.get(sourceHash)
      if (existingImageId) {
        nextImageUrls.push(buildManagedImageUrl(existingImageId, mode, env))
        reusedUrlCount += 1
        continue
      }

      try {
        const fetched = await fetchImage(normalizedSourceUrl)
        const imageId = createNanoId()
        const contentHash = sha256Hex(fetched.bytes)

        putR2Object(mode, env, bucketName, imageId, fetched.bytes, fetched.contentType)

        insertImageStatements.push(`
          INSERT INTO images (
            id, r2_key, source_url, source_url_sha256, content_sha256,
            content_type, byte_size, width, height, etag,
            created_at, updated_at, last_checked_at
          ) VALUES (
            ${sqlString(imageId)},
            ${sqlString(imageId)},
            ${sqlString(normalizedSourceUrl)},
            ${sqlString(sourceHash)},
            ${sqlString(contentHash)},
            ${sqlString(fetched.contentType)},
            ${fetched.bytes.byteLength},
            NULL,
            NULL,
            ${sqlString(fetched.etag)},
            ${now},
            ${now},
            ${now}
          );
        `)

        imageIdBySourceHash.set(sourceHash, imageId)
        nextImageUrls.push(buildManagedImageUrl(imageId, mode, env))
        migratedUrlCount += 1
        console.log(`[migrated] gear_id=${gear.id} title="${gear.title}" source="${normalizedSourceUrl}" image_id=${imageId}`)
      } catch (error) {
        failedUrlCount += 1
        nextImageUrls.push(normalizedSourceUrl)
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[failed] gear_id=${gear.id} source="${normalizedSourceUrl}" reason=${message}`)
      }
    }

    const normalizedNextUrls = normalizeImageUrls(nextImageUrls)
    const nextPrimaryImageUrl = normalizedNextUrls[0] ?? null

    const currentJson = JSON.stringify(currentImageUrls)
    const nextJson = JSON.stringify(normalizedNextUrls)
    const currentPrimary = currentImageUrls[0] ?? null
    const changed = currentJson !== nextJson || currentPrimary !== nextPrimaryImageUrl

    if (!changed) {
      continue
    }

    changedItemCount += 1
    updateGearStatements.push(`
      UPDATE gear_items
      SET image_url = ${sqlString(nextPrimaryImageUrl)},
          image_urls = ${sqlString(nextJson)},
          updated_at = ${now}
      WHERE id = ${gear.id};
    `)
    console.log(`[updated] gear_id=${gear.id} title="${gear.title}" image_count=${normalizedNextUrls.length}`)
  }

  if (insertImageStatements.length < 1 && updateGearStatements.length < 1) {
    console.log('[done] 変更なし')
    return
  }

  const sql = [...insertImageStatements, ...updateGearStatements].join('\n')

  mkdirSync(resolve(process.cwd(), '.context'), { recursive: true })
  const outputSqlPath = resolve(process.cwd(), '.context/backfill_gear_images_to_r2.sql')
  writeFileSync(outputSqlPath, sql)

  runD1File(mode, env, outputSqlPath)

  console.log(
    `[summary] changed_items=${changedItemCount} migrated_urls=${migratedUrlCount} reused_urls=${reusedUrlCount} skipped_urls=${skippedUrlCount} failed_urls=${failedUrlCount}`,
  )
  console.log(`[sql] ${outputSqlPath}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
