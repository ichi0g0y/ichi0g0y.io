import type { GearItem } from './types'

export interface GearRow {
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

export function mapGearRow(row: GearRow): GearItem {
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

export function normalizeImageFit(value: unknown): GearItem['imageFit'] {
  return value === 'cover' ? 'cover' : 'contain'
}

export function parseStoredImageUrls(imageUrlsJson: string | null, fallbackImageUrl: string | null) {
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
      // 壊れたレガシーJSONを無視し、単一の image_url にフォールバックする。
    }
  }

  append(fallbackImageUrl)
  return values
}
