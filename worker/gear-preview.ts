export interface LinkPreview {
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

function isUnsupportedAmazonImageUrl(url: URL) {
  if (!isAmazonHost(url.hostname)) {
    return false
  }
  return url.pathname.startsWith('/api/images/')
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

export function normalizeImageUrls(values: string[]) {
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

export function resolveRequestedImageUrls(imageUrls: unknown, imageUrl: unknown, base: URL) {
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

export function collectImageCandidates(html: string, base: URL, primaryImageUrl: string | null) {
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
      const parsed = new URL(url)
      const protocol = parsed.protocol
      if (!['http:', 'https:'].includes(protocol)) {
        continue
      }
      if (isUnsupportedAmazonImageUrl(parsed)) {
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
