import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, readJsonBody } from './utils'
import { ensureGearItemsSchema } from './gear-schema'
import { translateToEnglishWithOpenAI } from './gear-translate'
import { fetchLinkPreview, resolveRequestedImageUrls, normalizeImageUrls } from './gear-preview'
import type { LinkPreview } from './gear-preview'
import { mapGearRow, normalizeImageFit, parseStoredImageUrls } from './gear-map'
import type { GearRow } from './gear-map'

export async function handleListGearItems(env: Env) {
  await ensureGearItemsSchema(env)
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

async function updateExistingGearItem(
  env: Env,
  existing: GearRow,
  fields: {
    title: string
    category: string
    description: string | null
    imageUrl: string | null
    imageUrls: string[]
    imageFit: string | null
    previewUrl: string
    canTranslate: boolean
  },
  preview: LinkPreview,
) {
  const now = nowSeconds()
  const nextCategory = fields.category
  const translatedForExisting = fields.canTranslate
    ? await translateToEnglishWithOpenAI({ title: fields.title, category: nextCategory, description: fields.description }, env)
    : null
  const nextImageFit = fields.imageFit ?? existing.image_fit
  const updated = await env.DB.prepare(
    `
      UPDATE gear_items
      SET title = ?1, title_en = ?2, category = ?3, category_en = ?4, image_url = ?5, image_urls = ?6, image_fit = ?7, link_url = ?8, description = ?9, description_en = ?10, updated_at = ?11
      WHERE id = ?12
      RETURNING id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
    `,
  )
    .bind(
      fields.title,
      translatedForExisting?.titleEn ?? existing.title_en,
      nextCategory,
      translatedForExisting?.categoryEn ?? existing.category_en,
      fields.imageUrl,
      JSON.stringify(fields.imageUrls),
      nextImageFit,
      fields.previewUrl,
      fields.description,
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

async function insertNewGearItem(
  env: Env,
  fields: {
    title: string
    category: string
    description: string | null
    imageUrl: string | null
    imageUrls: string[]
    imageFit: string
    previewUrl: string
    canTranslate: boolean
  },
  preview: LinkPreview,
) {
  const now = nowSeconds()
  const sortRow = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM gear_items').first<{
    max_sort: number
  }>()
  const nextSort = (sortRow?.max_sort ?? 0) + 10
  const translatedForInsert = fields.canTranslate
    ? await translateToEnglishWithOpenAI({ title: fields.title, category: fields.category, description: fields.description }, env)
    : null

  const inserted = await env.DB.prepare(
    `
      INSERT INTO gear_items (title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      RETURNING id, title, title_en, category, category_en, image_url, image_urls, image_fit, link_url, description, description_en, sort_order, created_at, updated_at
    `,
  )
    .bind(
      fields.title,
      translatedForInsert?.titleEn ?? null,
      fields.category,
      translatedForInsert?.categoryEn ?? null,
      fields.imageUrl,
      JSON.stringify(fields.imageUrls),
      fields.imageFit,
      fields.previewUrl,
      fields.description,
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

export async function handleCreateGearFromUrl(request: Request, env: Env) {
  await ensureGearItemsSchema(env)
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
    return updateExistingGearItem(
      env,
      existing,
      { title, category: nextCategory, description, imageUrl, imageUrls, imageFit: requestedImageFit, previewUrl: preview.url, canTranslate },
      preview,
    )
  }

  return insertNewGearItem(
    env,
    { title, category, description, imageUrl, imageUrls, imageFit, previewUrl: preview.url, canTranslate },
    preview,
  )
}

export async function handleUpdateGearItem(request: Request, env: Env) {
  await ensureGearItemsSchema(env)
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
  await ensureGearItemsSchema(env)
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
  const newCategoryEn = translated?.categoryEn ?? null
  let result
  if (newCategoryEn != null) {
    result = await env.DB
      .prepare('UPDATE gear_items SET category = ?1, category_en = ?2, updated_at = ?3 WHERE category = ?4')
      .bind(newCategory, newCategoryEn, now, oldCategory)
      .run()
  } else {
    // 翻訳不可時は既存の category_en を保持する
    result = await env.DB
      .prepare('UPDATE gear_items SET category = ?1, updated_at = ?2 WHERE category = ?3')
      .bind(newCategory, now, oldCategory)
      .run()
  }
  const updatedCount = result.meta.changes ?? 0

  return jsonResponse({
    ok: true,
    oldCategory,
    newCategory,
    newCategoryEn,
    updatedCount,
  })
}

export async function handleReorderGearItems(request: Request, env: Env) {
  await ensureGearItemsSchema(env)
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
  await ensureGearItemsSchema(env)
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
