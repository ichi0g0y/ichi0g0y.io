import type { Env } from './types'
import { errorResponse, jsonResponse, nowSeconds, readJsonBody } from './utils'
import { ensureGearItemsSchema } from './gear-schema'
import { translateToEnglishWithOpenAI } from './gear-translate'
import { fetchLinkPreview, resolveRequestedImageUrls, normalizeImageUrls } from './gear-preview'
import type { LinkPreview } from './gear-preview'
import { mapGearRow, normalizeImageFit, parseStoredImageUrls } from './gear-map'
import type { GearRow } from './gear-map'
import { backupImageUrls } from './image-store'

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

export async function handleTranslateGearDescription(request: Request, env: Env) {
  const body = await readJsonBody<{
    title?: string
    category?: string
    description?: string
  }>(request)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''

  if (!description) {
    return errorResponse('翻訳対象の日本語説明を入力してください', 400)
  }

  if (!env.OPENAI_API_KEY?.trim()) {
    return errorResponse('翻訳機能が未設定です（OPENAI_API_KEY が必要です）', 400)
  }

  const translated = await translateToEnglishWithOpenAI(
    {
      title: title || 'Untitled',
      category: category || 'Other',
      description,
    },
    env,
  )
  if (!translated.descriptionEn) {
    return errorResponse('英語説明の生成に失敗しました', 502)
  }

  return jsonResponse({
    ok: true,
    descriptionEn: translated.descriptionEn,
  })
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
  let imageUrls = requestedImages.imageUrls ?? previewImageUrls
  imageUrls = await backupImageUrls(env, request, imageUrls)
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
    titleEn?: string
    description?: string
    descriptionEn?: string
    category?: string
    categoryEn?: string
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

  const titleInput = typeof body?.title === 'string' ? body.title : null
  const titleEnInput = typeof body?.titleEn === 'string' ? body.titleEn : null
  const categoryInput = typeof body?.category === 'string' ? body.category : null
  const categoryEnInput = typeof body?.categoryEn === 'string' ? body.categoryEn : null
  const descriptionInput = typeof body?.description === 'string' ? body.description : null
  const descriptionEnInput = typeof body?.descriptionEn === 'string' ? body.descriptionEn : null

  const hasTitle = titleInput != null
  const hasTitleEn = titleEnInput != null
  const hasCategory = categoryInput != null
  const hasCategoryEn = categoryEnInput != null
  const hasDescription = descriptionInput != null
  const hasDescriptionEn = descriptionEnInput != null

  const nextTitle = hasTitle ? titleInput.trim() : existing.title
  if (hasTitle && !nextTitle) {
    return errorResponse('タイトルを入力してください', 400)
  }
  const nextTitleEnRaw = hasTitleEn ? titleEnInput.trim() : existing.title_en
  const nextTitleEn = nextTitleEnRaw || null

  const nextCategoryRaw = hasCategory ? categoryInput.trim() : existing.category
  const nextCategory = nextCategoryRaw || existing.category
  const nextCategoryEnRaw = hasCategoryEn ? categoryEnInput.trim() : existing.category_en
  const nextCategoryEn = nextCategoryEnRaw || null
  const nextDescription = hasDescription ? descriptionInput.trim() || null : existing.description
  const nextDescriptionEn = hasDescriptionEn ? descriptionEnInput.trim() || null : existing.description_en
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
  const nextImageUrlsRaw = resolvedImageUrls.imageUrls ?? parseStoredImageUrls(existing.image_urls, existing.image_url)
  const shouldBackupImages = body?.imageUrls !== undefined || body?.imageUrl !== undefined
  const nextImageUrls = shouldBackupImages ? await backupImageUrls(env, request, nextImageUrlsRaw) : nextImageUrlsRaw
  const nextImageUrl = nextImageUrls[0] ?? null
  const nextImageFit = body?.imageFit === undefined ? existing.image_fit : normalizeImageFit(body.imageFit)
  const canTranslate = Boolean(env.OPENAI_API_KEY?.trim()) && (hasTitle || hasCategory || hasDescription)
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
      hasTitleEn ? nextTitleEn : translated?.titleEn ?? existing.title_en,
      nextCategory,
      hasCategoryEn ? nextCategoryEn : translated?.categoryEn ?? existing.category_en,
      nextDescription,
      hasDescriptionEn ? nextDescriptionEn : translated?.descriptionEn ?? existing.description_en,
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
  const body = await readJsonBody<{
    oldCategory?: string
    newCategory?: string
    targetCategory?: string
    newCategoryEn?: string
  }>(request)
  const oldCategory = typeof body?.oldCategory === 'string' ? body.oldCategory.trim() : ''
  const newCategory = typeof body?.newCategory === 'string' ? body.newCategory.trim() : ''
  const targetCategory = typeof body?.targetCategory === 'string' ? body.targetCategory.trim() : ''
  const hasNewCategoryEn = typeof body?.newCategoryEn === 'string'
  const newCategoryEn = hasNewCategoryEn ? body.newCategoryEn.trim() || null : null

  if (targetCategory) {
    const now = nowSeconds()
    const result = await env.DB
      .prepare('UPDATE gear_items SET category_en = ?1, updated_at = ?2 WHERE category = ?3')
      .bind(newCategoryEn, now, targetCategory)
      .run()
    const updatedCount = result.meta.changes ?? 0
    return jsonResponse({
      ok: true,
      targetCategory,
      newCategoryEn,
      updatedCount,
    })
  }

  if (!oldCategory) {
    return errorResponse('変更前カテゴリ名を入力してください', 400)
  }

  if (!newCategory) {
    return errorResponse('変更後カテゴリ名を入力してください', 400)
  }

  if (oldCategory === newCategory && !hasNewCategoryEn) {
    return jsonResponse({ ok: true, oldCategory, newCategory, updatedCount: 0 })
  }

  const canTranslate = Boolean(env.OPENAI_API_KEY?.trim()) && !hasNewCategoryEn
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
  const translatedCategoryEn = hasNewCategoryEn ? newCategoryEn : translated?.categoryEn ?? null
  let result
  if (hasNewCategoryEn) {
    result = await env.DB
      .prepare('UPDATE gear_items SET category = ?1, category_en = ?2, updated_at = ?3 WHERE category = ?4')
      .bind(newCategory, translatedCategoryEn, now, oldCategory)
      .run()
  } else if (translatedCategoryEn != null) {
    result = await env.DB
      .prepare('UPDATE gear_items SET category = ?1, category_en = ?2, updated_at = ?3 WHERE category = ?4')
      .bind(newCategory, translatedCategoryEn, now, oldCategory)
      .run()
  } else {
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
    newCategoryEn: translatedCategoryEn,
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
