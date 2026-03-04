import type { Env, GearItem } from './types'
import { errorResponse, jsonResponse, nowSeconds, readJsonBody } from './utils'

interface GearRow {
  id: number
  title: string
  title_en: string | null
  category: string
  category_en: string | null
  image_url: string | null
  image_urls: string | null
  image_fit: 'cover' | 'contain'
  link_url: string | null
  description: string | null
  description_en: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

interface LinkPreview {
  url: string
  title: string | null
  description: string | null
  imageUrl: string | null
  imageCandidates: string[]
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const PREVIEW_FETCH_TIMEOUT_MS = 20_000
const OPENAI_TRANSLATE_TIMEOUT_MS = 15_000
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'

interface EnglishTranslation {
  titleEn: string | null
  categoryEn: string | null
  descriptionEn: string | null
}

function normalizeTranslatedField(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function translateToEnglishWithOpenAI(
  source: { title: string; category: string; description: string | null },
  env: Env,
): Promise<EnglishTranslation> {
  const apiKey = env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return {
      titleEn: null,
      categoryEn: null,
      descriptionEn: null,
    }
  }

  const model = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OPENAI_TRANSLATE_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Translate Japanese e-commerce-like item fields into natural English. Return only JSON with keys: titleEn, categoryEn, descriptionEn. Keep product names and model numbers unchanged as much as possible.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              title: source.title,
              category: source.category,
              description: source.description,
            }),
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return {
        titleEn: null,
        categoryEn: null,
        descriptionEn: null,
      }
    }

    const data = (await response.json().catch(() => null)) as
      | {
          choices?: Array<{
            message?: {
              content?: string | null
            }
          }>
        }
      | null
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      return {
        titleEn: null,
        categoryEn: null,
        descriptionEn: null,
      }
    }

    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      titleEn: normalizeTranslatedField(parsed.titleEn),
      categoryEn: normalizeTranslatedField(parsed.categoryEn),
      descriptionEn: normalizeTranslatedField(parsed.descriptionEn),
    }
  } catch {
    return {
      titleEn: null,
      categoryEn: null,
      descriptionEn: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

function mapGearRow(row: GearRow): GearItem {
  const imageUrls = parseStoredImageUrls(row.image_urls, row.image_url)
  return {
    id: row.id,
    title: row.title,
    titleEn: row.title_en,
    category: row.category,
    categoryEn: row.category_en,
    imageUrl: imageUrls[0] ?? null,
    imageUrls,
    imageFit: row.image_fit === 'cover' ? 'cover' : 'contain',
    linkUrl: row.link_url,
    description: row.description,
    descriptionEn: row.description_en,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeImageFit(value: unknown): GearItem['imageFit'] {
  return value === 'cover' ? 'cover' : 'contain'
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
      // ignore broken legacy JSON and fallback to single image_url.
    }
  }

  append(fallbackImageUrl)
  return values
}

function extractMetaContent(html: string, key: string) {
  const metaTagRegex = /<meta\s+[^>]*>/gi
  const attrRegex = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  const target = key.toLowerCase()
  const matches = html.match(metaTagRegex) ?? []

  for (const tag of matches) {
    const attrs = new Map<string, string>()
    let attrMatch: RegExpExecArray | null = attrRegex.exec(tag)
    while (attrMatch) {
      const attrName = attrMatch[1].toLowerCase()
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
      attrs.set(attrName, attrValue)
      attrMatch = attrRegex.exec(tag)
    }
    attrRegex.lastIndex = 0

    const property = attrs.get('property')?.toLowerCase()
    const name = attrs.get('name')?.toLowerCase()
    const content = attrs.get('content')
    if (!content) {
      continue
    }
    if (property === target || name === target) {
      return content
    }
  }

  return null
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() ?? null
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const codePoint = Number.parseInt(entity.slice(2), 16)
      return Number.isNaN(codePoint) ? full : String.fromCodePoint(codePoint)
    }

    if (entity.startsWith('#')) {
      const codePoint = Number.parseInt(entity.slice(1), 10)
      return Number.isNaN(codePoint) ? full : String.fromCodePoint(codePoint)
    }

    return HTML_ENTITY_MAP[entity] ?? full
  })
}

function normalizePreviewValue(value: string | null) {
  if (!value) {
    return null
  }
  const trimmed = decodeHtmlEntities(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function isAmazonHost(hostname: string) {
  return hostname === 'amzn.asia' || hostname.includes('amazon.')
}

function isAmazonGenericText(value: string | null) {
  if (!value) {
    return false
  }
  const normalized = value.trim().toLowerCase()
  return normalized === 'amazon' || normalized === 'amazon.co.jp' || normalized === 'amazon.com'
}

function normalizeAmazonTitle(value: string | null) {
  if (!value) {
    return null
  }

  return value
    .replace(/^amazon\.[^:]+:\s*/i, '')
    .replace(/\s*:\s*[^:]+$/, '')
    .trim()
}

function parseAttributes(tag: string) {
  const attrRegex = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
  const attrs = new Map<string, string>()
  let attrMatch: RegExpExecArray | null = attrRegex.exec(tag)

  while (attrMatch) {
    const attrName = attrMatch[1].toLowerCase()
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? ''
    attrs.set(attrName, attrValue)
    attrMatch = attrRegex.exec(tag)
  }

  return attrs
}

function extractAmazonDynamicImages(rawValue: string | null) {
  if (!rawValue) {
    return [] as string[]
  }

  try {
    const decoded = decodeHtmlEntities(rawValue)
    const parsed = JSON.parse(decoded) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return [] as string[]
    }

    const candidates: Array<{ url: string; area: number }> = []

    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key !== 'string' || !Array.isArray(value)) {
        continue
      }

      const widthRaw = value[0]
      const heightRaw = value[1]
      const width = typeof widthRaw === 'number' ? widthRaw : Number(widthRaw)
      const height = typeof heightRaw === 'number' ? heightRaw : Number(heightRaw)
      const area = Number.isFinite(width) && Number.isFinite(height) ? width * height : 0

      candidates.push({ url: key, area })
    }

    candidates.sort((left, right) => right.area - left.area)
    return candidates.map((entry) => entry.url)
  } catch {
    return [] as string[]
  }
}

function extractLargestAmazonDynamicImage(rawValue: string | null) {
  return extractAmazonDynamicImages(rawValue)[0] ?? null
}

function decodeJsonStringLiteral(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string
  } catch {
    return value
  }
}

function extractAmazonScriptImageCandidates(html: string) {
  const values: string[] = []
  const patterns = [/"hiRes"\s*:\s*"([^"]+)"/g, /"large"\s*:\s*"([^"]+)"/g, /"mainUrl"\s*:\s*"([^"]+)"/g]

  for (const pattern of patterns) {
    let match = pattern.exec(html)
    while (match) {
      const unescaped = decodeJsonStringLiteral(match[1])
      const normalized = normalizePreviewValue(unescaped)
      if (normalized) {
        values.push(normalized)
      }
      match = pattern.exec(html)
    }
    pattern.lastIndex = 0
  }

  return normalizeImageUrls(values)
}

function expandAmazonImageUrlVariants(absoluteUrl: string) {
  try {
    const parsed = new URL(absoluteUrl)
    if (!parsed.hostname.includes('media-amazon.com')) {
      return [absoluteUrl]
    }

    const match = parsed.pathname.match(/^(.*)\._[^/]+_(\.[a-zA-Z0-9]+)$/)
    if (!match) {
      return [absoluteUrl]
    }

    const prefix = match[1]
    const ext = match[2]
    const variants = [
      `${prefix}._AC_SL1500_${ext}`,
      `${prefix}._SL1500_${ext}`,
      `${prefix}${ext}`,
      parsed.pathname,
    ]

    const urls: string[] = []
    const seen = new Set<string>()
    for (const pathname of variants) {
      const url = `${parsed.origin}${pathname}${parsed.search}`
      if (seen.has(url)) {
        continue
      }
      seen.add(url)
      urls.push(url)
    }
    return urls
  } catch {
    return [absoluteUrl]
  }
}

function extractAmazonLandingImage(html: string) {
  const match = html.match(/<img\s+[^>]*id=(["'])landingImage\1[^>]*>/i)
  if (!match) {
    return null
  }

  const attrs = parseAttributes(match[0])
  const dynamicImage = extractLargestAmazonDynamicImage(attrs.get('data-a-dynamic-image') ?? null)
  const oldHiresImage = normalizePreviewValue(attrs.get('data-old-hires') ?? null)
  return dynamicImage ?? oldHiresImage ?? attrs.get('src') ?? null
}

function toAbsoluteUrl(value: string | null, base: URL) {
  if (!value) {
    return null
  }
  try {
    return new URL(value, base).toString()
  } catch {
    return null
  }
}

function normalizeImageUrls(values: string[]) {
  const normalized: string[] = []
  const seen = new Set<string>()
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

function resolveRequestedImageUrls(imageUrls: unknown, imageUrl: unknown, base: URL) {
  const resolved: string[] = []

  if (imageUrls !== undefined) {
    if (!Array.isArray(imageUrls)) {
      return { ok: false as const, error: '画像URL一覧が不正です' }
    }
    for (const value of imageUrls) {
      if (typeof value !== 'string') {
        return { ok: false as const, error: '画像URL一覧が不正です' }
      }
      const absolute = toAbsoluteUrl(value.trim(), base)
      if (!absolute) {
        return { ok: false as const, error: '画像URLが不正です' }
      }
      resolved.push(absolute)
    }
    return { ok: true as const, imageUrls: normalizeImageUrls(resolved) }
  }

  if (imageUrl !== undefined) {
    if (typeof imageUrl !== 'string') {
      return { ok: false as const, error: '画像URLが不正です' }
    }
    const trimmed = imageUrl.trim()
    if (!trimmed) {
      return { ok: true as const, imageUrls: [] }
    }
    const absolute = toAbsoluteUrl(trimmed, base)
    if (!absolute) {
      return { ok: false as const, error: '画像URLが不正です' }
    }
    return { ok: true as const, imageUrls: [absolute] }
  }

  return { ok: true as const, imageUrls: null as string[] | null }
}

function collectImageCandidates(html: string, base: URL, primaryImageUrl: string | null) {
  const candidates: string[] = []
  const seen = new Set<string>()
  const amazonHost = isAmazonHost(base.hostname)

  const pushCandidate = (raw: string | null) => {
    const normalized = normalizePreviewValue(raw)
    if (!normalized) {
      return
    }
    const absolute = toAbsoluteUrl(normalized, base)
    if (!absolute) {
      return
    }
    const expanded = amazonHost ? expandAmazonImageUrlVariants(absolute) : [absolute]
    for (const url of expanded) {
      if (seen.has(url)) {
        continue
      }
      const protocol = new URL(url).protocol
      if (!['http:', 'https:'].includes(protocol)) {
        continue
      }
      seen.add(url)
      candidates.push(url)
      if (candidates.length >= 24) {
        break
      }
    }
  }

  const pushCandidates = (values: string[]) => {
    for (const value of values) {
      pushCandidate(value)
      if (candidates.length >= 24) {
        break
      }
    }
  }

  pushCandidate(primaryImageUrl)
  pushCandidate(extractMetaContent(html, 'twitter:image'))
  pushCandidate(extractMetaContent(html, 'twitter:image:src'))
  if (amazonHost) {
    pushCandidates(extractAmazonScriptImageCandidates(html))
  }

  const imgTagRegex = /<img\s+[^>]*>/gi
  const imgTags = html.match(imgTagRegex) ?? []
  for (const tag of imgTags) {
    const attrs = parseAttributes(tag)
    pushCandidates(extractAmazonDynamicImages(attrs.get('data-a-dynamic-image') ?? null))
    pushCandidate(attrs.get('src') ?? null)
    pushCandidate(attrs.get('data-src') ?? null)
    pushCandidate(attrs.get('data-old-hires') ?? null)
    if (candidates.length >= 24) {
      break
    }
  }

  return candidates.slice(0, 24)
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const target = new URL(url)
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('http/https のURLのみ対応しています')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PREVIEW_FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ichi0g0y-bot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new Error(`URL取得に失敗しました (${response.status})`)
  }

  const finalUrl = response.url || target.toString()
  const finalTarget = new URL(finalUrl)
  const html = await response.text()

  const ogTitle = normalizePreviewValue(extractMetaContent(html, 'og:title'))
  const metaTitle = normalizePreviewValue(extractMetaContent(html, 'title'))
  const pageTitle = normalizePreviewValue(extractTitle(html))
  const ogDescription = normalizePreviewValue(extractMetaContent(html, 'og:description'))
  const metaDescription = normalizePreviewValue(extractMetaContent(html, 'description'))
  const ogImage = normalizePreviewValue(extractMetaContent(html, 'og:image'))

  const useAmazonFallback = isAmazonHost(finalTarget.hostname) && isAmazonGenericText(ogTitle)
  const titleRaw = useAmazonFallback ? metaTitle ?? pageTitle ?? ogTitle : ogTitle ?? metaTitle ?? pageTitle
  const title = isAmazonHost(finalTarget.hostname) ? normalizeAmazonTitle(titleRaw) : titleRaw
  const description = useAmazonFallback ? metaDescription ?? ogDescription : ogDescription ?? metaDescription

  let imageUrl = toAbsoluteUrl(ogImage, finalTarget)
  const isGenericAmazonImage = imageUrl?.includes('/share-icons/previewdoh/amazon.png') ?? false
  const amazonLandingImage = isAmazonHost(finalTarget.hostname)
    ? toAbsoluteUrl(normalizePreviewValue(extractAmazonLandingImage(html)), finalTarget)
    : null
  if (amazonLandingImage) {
    imageUrl = amazonLandingImage
  } else if (useAmazonFallback && isGenericAmazonImage) {
    imageUrl = toAbsoluteUrl(normalizePreviewValue(extractAmazonLandingImage(html)), finalTarget) ?? imageUrl
  }
  const imageCandidates = collectImageCandidates(html, finalTarget, imageUrl)
  if (!imageUrl && imageCandidates.length > 0) {
    imageUrl = imageCandidates[0]
  }

  return {
    url: finalUrl,
    title,
    description,
    imageUrl,
    imageCandidates,
  }
}

export async function handleListGearItems(env: Env) {
  const rows = await env.DB.prepare(
    `
      SELECT id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
      FROM gear_items
      ORDER BY sort_order ASC, id ASC
    `,
  ).all<GearRow>()

  const items = (rows.results ?? []).map(mapGearRow)
  return jsonResponse({ ok: true, items })
}

export async function handlePreview(request: Request) {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')
  if (!target) {
    return errorResponse('url パラメータが必要です', 400)
  }

  try {
    const preview = await fetchLinkPreview(target)
    return jsonResponse({ ok: true, preview })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'URLプレビュー取得に失敗しました'
    return errorResponse(message, 400)
  }
}

export async function handleCreateGearFromUrl(request: Request, env: Env) {
  const body = await readJsonBody<{
    url?: string
    title?: string
    description?: string
    category?: string
    imageUrl?: unknown
    imageUrls?: unknown
    imageFit?: unknown
  }>(request)
  const inputUrl = body?.url?.trim()

  if (!inputUrl) {
    return errorResponse('URLを入力してください', 400)
  }

  let preview: LinkPreview
  try {
    preview = await fetchLinkPreview(inputUrl)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'リンク情報の取得に失敗しました'
    return errorResponse(message, 400)
  }

  const now = nowSeconds()
  const requestedCategory = body?.category?.trim()
  const requestedTitle = body?.title?.trim()
  const requestedDescriptionRaw = body?.description
  const requestedDescription = typeof requestedDescriptionRaw === 'string' ? requestedDescriptionRaw.trim() : null
  const requestedImages = resolveRequestedImageUrls(body?.imageUrls, body?.imageUrl, new URL(preview.url))
  if (!requestedImages.ok) {
    return errorResponse(requestedImages.error, 400)
  }
  const requestedImageFit = body?.imageFit === undefined ? null : normalizeImageFit(body.imageFit)
  const category = requestedCategory || '外部リンク'
  const title = requestedTitle || preview.title || new URL(preview.url).hostname
  const description = requestedDescription || preview.description
  const canTranslate = Boolean(env.OPENAI_API_KEY?.trim())
  const previewImageUrls = normalizeImageUrls(preview.imageCandidates.length > 0 ? preview.imageCandidates : [preview.imageUrl ?? ''])
  const imageUrls = requestedImages.imageUrls ?? previewImageUrls
  const imageUrl = imageUrls[0] ?? null
  const imageFit = requestedImageFit ?? 'contain'

  const existing = await env.DB.prepare(
    `
      SELECT id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
      FROM gear_items
      WHERE link_url = ?1 OR link_url = ?2
      ORDER BY id DESC
      LIMIT 1
    `,
  )
    .bind(inputUrl, preview.url)
    .first<GearRow>()

  if (existing) {
    const nextCategory = requestedCategory || existing.category
    const translatedForExisting = canTranslate
      ? await translateToEnglishWithOpenAI({ title, category: nextCategory, description }, env)
      : null
    const nextImageFit = requestedImageFit ?? existing.image_fit
    const updated = await env.DB.prepare(
      `
        UPDATE gear_items
        SET title = ?1, title_en = ?2, category = ?3, category_en = ?4, image_url = ?5, image_urls = ?6, image_fit = ?7, link_url = ?8, description = ?9, description_en = ?10, updated_at = ?11
        WHERE id = ?12
        RETURNING id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
      `,
    )
      .bind(
        title,
        translatedForExisting?.titleEn ?? existing.title_en,
        nextCategory,
        translatedForExisting?.categoryEn ?? existing.category_en,
        imageUrl,
        JSON.stringify(imageUrls),
        nextImageFit,
        preview.url,
        description,
        translatedForExisting?.descriptionEn ?? existing.description_en,
        now,
        existing.id,
      )
      .first<GearRow>()

    if (!updated) {
      return errorResponse('カード更新に失敗しました', 500)
    }

    return jsonResponse({ ok: true, item: mapGearRow(updated), preview })
  }

  const sortRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM gear_items').first<{
    max_sort: number
  }>()
  const nextSort = (sortRow?.max_sort ?? 0) + 10
  const translatedForInsert = canTranslate ? await translateToEnglishWithOpenAI({ title, category, description }, env) : null

  const inserted = await env.DB.prepare(
    `
      INSERT INTO gear_items (title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      RETURNING id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
    `,
  )
    .bind(
      title,
      translatedForInsert?.titleEn ?? null,
      category,
      translatedForInsert?.categoryEn ?? null,
      imageUrl,
      JSON.stringify(imageUrls),
      imageFit,
      preview.url,
      description,
      translatedForInsert?.descriptionEn ?? null,
      nextSort,
      now,
      now,
    )
    .first<GearRow>()

  if (!inserted) {
    return errorResponse('カード作成に失敗しました', 500)
  }

  return jsonResponse({ ok: true, item: mapGearRow(inserted), preview })
}

export async function handleUpdateGearItem(request: Request, env: Env) {
  const url = new URL(request.url)
  const matched = url.pathname.match(/^\/api\/admin\/gear-items\/(\d+)$/)
  const id = Number.parseInt(matched?.[1] ?? '', 10)
  if (!Number.isFinite(id) || id <= 0) {
    return errorResponse('更新対象のIDが不正です', 400)
  }

  const body = await readJsonBody<{
    title?: string
    description?: string
    category?: string
    imageUrls?: unknown
    imageUrl?: unknown
    imageFit?: unknown
  }>(request)
  const existing = await env.DB.prepare(
    `
      SELECT id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
      FROM gear_items
      WHERE id = ?1
      LIMIT 1
    `,
  )
    .bind(id)
    .first<GearRow>()

  if (!existing) {
    return errorResponse('対象のカードが見つかりません', 404)
  }

  const nextTitle = typeof body?.title === 'string' ? body.title.trim() : existing.title
  if (!nextTitle) {
    return errorResponse('タイトルを入力してください', 400)
  }

  const nextCategoryRaw = typeof body?.category === 'string' ? body.category.trim() : existing.category
  const nextCategory = nextCategoryRaw || existing.category
  const nextDescription =
    typeof body?.description === 'string' ? (body.description.trim() || null) : existing.description
  let imageBaseUrl = new URL(request.url)
  if (existing.link_url) {
    try {
      imageBaseUrl = new URL(existing.link_url)
    } catch {
      imageBaseUrl = new URL(request.url)
    }
  }
  const resolvedImageUrls = resolveRequestedImageUrls(body?.imageUrls, body?.imageUrl, imageBaseUrl)
  if (!resolvedImageUrls.ok) {
    return errorResponse(resolvedImageUrls.error, 400)
  }
  const nextImageUrls = resolvedImageUrls.imageUrls ?? parseStoredImageUrls(existing.image_urls, existing.image_url)
  const nextImageUrl = nextImageUrls[0] ?? null
  const nextImageFit = body?.imageFit === undefined ? existing.image_fit : normalizeImageFit(body.imageFit)
  const canTranslate = Boolean(env.OPENAI_API_KEY?.trim())
  const translated = canTranslate
    ? await translateToEnglishWithOpenAI(
        {
          title: nextTitle,
          category: nextCategory,
          description: nextDescription,
        },
        env,
      )
    : null

  const now = nowSeconds()
  const updated = await env.DB.prepare(
    `
      UPDATE gear_items
      SET title = ?1, title_en = ?2, category = ?3, category_en = ?4, description = ?5, description_en = ?6, image_url = ?7, image_urls = ?8, image_fit = ?9, updated_at = ?10
      WHERE id = ?11
      RETURNING id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
    `,
  )
    .bind(
      nextTitle,
      translated?.titleEn ?? existing.title_en,
      nextCategory,
      translated?.categoryEn ?? existing.category_en,
      nextDescription,
      translated?.descriptionEn ?? existing.description_en,
      nextImageUrl,
      JSON.stringify(nextImageUrls),
      nextImageFit,
      now,
      id,
    )
    .first<GearRow>()

  if (!updated) {
    return errorResponse('カード更新に失敗しました', 500)
  }

  return jsonResponse({ ok: true, item: mapGearRow(updated) })
}

export async function handleRenameGearCategory(request: Request, env: Env) {
  const body = await readJsonBody<{ oldCategory?: string; newCategory?: string }>(request)
  const oldCategory = typeof body?.oldCategory === 'string' ? body.oldCategory.trim() : ''
  const newCategory = typeof body?.newCategory === 'string' ? body.newCategory.trim() : ''

  if (!oldCategory) {
    return errorResponse('変更前カテゴリ名を入力してください', 400)
  }

  if (!newCategory) {
    return errorResponse('変更後カテゴリ名を入力してください', 400)
  }

  if (oldCategory === newCategory) {
    return jsonResponse({ ok: true, oldCategory, newCategory, updatedCount: 0 })
  }

  const canTranslate = Boolean(env.OPENAI_API_KEY?.trim())
  const translated = canTranslate
    ? await translateToEnglishWithOpenAI(
        {
          title: newCategory,
          category: newCategory,
          description: null,
        },
        env,
      )
    : null
  const now = nowSeconds()
  const result = await env.DB
    .prepare('UPDATE gear_items SET category = ?1, category_en = ?2, updated_at = ?3 WHERE category = ?4')
    .bind(newCategory, translated?.categoryEn ?? null, now, oldCategory)
    .run()
  const updatedCount = result.meta.changes ?? 0

  return jsonResponse({
    ok: true,
    oldCategory,
    newCategory,
    updatedCount,
  })
}

export async function handleReorderGearItems(request: Request, env: Env) {
  const body = await readJsonBody<{ orderedIds?: number[] }>(request)
  const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds : null

  if (!orderedIds || orderedIds.length < 1) {
    return errorResponse('並び順のID一覧が必要です', 400)
  }

  if (!orderedIds.every((id) => Number.isInteger(id) && id > 0)) {
    return errorResponse('並び順のID一覧が不正です', 400)
  }

  const uniqueIds = new Set(orderedIds)
  if (uniqueIds.size !== orderedIds.length) {
    return errorResponse('並び順のID一覧に重複があります', 400)
  }

  const rows = await env.DB.prepare('SELECT id FROM gear_items ORDER BY sort_order ASC, id ASC').all<{ id: number }>()
  const existingIds = (rows.results ?? []).map((row) => row.id)

  if (existingIds.length !== orderedIds.length) {
    return errorResponse('並び順の対象数が一致しません', 400)
  }

  const existingSet = new Set(existingIds)
  const isSameSet = orderedIds.every((id) => existingSet.has(id))
  if (!isSameSet) {
    return errorResponse('並び順のID一覧に不明なIDがあります', 400)
  }

  const now = nowSeconds()
  const statements = orderedIds.map((id, index) => {
    const nextSort = (index + 1) * 10
    return env.DB.prepare('UPDATE gear_items SET sort_order = ?1, updated_at = ?2 WHERE id = ?3').bind(nextSort, now, id)
  })
  await env.DB.batch(statements)

  return jsonResponse({ ok: true, orderedIds })
}

export async function handleDeleteGearItem(request: Request, env: Env) {
  const url = new URL(request.url)
  const matched = url.pathname.match(/^\/api\/admin\/gear-items\/(\d+)$/)
  const id = Number.parseInt(matched?.[1] ?? '', 10)

  if (!Number.isFinite(id) || id <= 0) {
    return errorResponse('削除対象のIDが不正です', 400)
  }

  const result = await env.DB.prepare('DELETE FROM gear_items WHERE id = ?1').bind(id).run()
  const changes = result.meta.changes ?? 0
  if (changes < 1) {
    return errorResponse('対象のカードが見つかりません', 404)
  }

  return jsonResponse({ ok: true, id })
}
