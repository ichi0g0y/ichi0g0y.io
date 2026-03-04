import type { Env } from './types'

let gearItemsSchemaReady = false
let gearItemsSchemaPromise: Promise<void> | null = null

function isDuplicateColumnError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.toLowerCase().includes('duplicate column name')
}

async function addColumnIfMissing(env: Env, sql: string) {
  try {
    await env.DB.prepare(sql).run()
    return true
  } catch (error) {
    if (isDuplicateColumnError(error)) {
      return false
    }
    throw error
  }
}

export async function ensureGearItemsSchema(env: Env) {
  if (gearItemsSchemaReady) {
    return
  }

  if (!gearItemsSchemaPromise) {
    gearItemsSchemaPromise = (async () => {
      const columnsResult = await env.DB.prepare('PRAGMA table_info(gear_items)').all<{ name: string }>()
      const existingColumns = new Set((columnsResult.results ?? []).map((column) => column.name))
      if (existingColumns.size < 1) {
        return
      }

      if (!existingColumns.has('image_fit')) {
        await addColumnIfMissing(env, "ALTER TABLE gear_items ADD COLUMN image_fit TEXT NOT NULL DEFAULT 'cover'")
      }

      let imageUrlsAdded = false
      if (!existingColumns.has('image_urls')) {
        imageUrlsAdded = await addColumnIfMissing(env, 'ALTER TABLE gear_items ADD COLUMN image_urls TEXT')
      }

      if (!existingColumns.has('title_en')) {
        await addColumnIfMissing(env, 'ALTER TABLE gear_items ADD COLUMN title_en TEXT')
      }

      if (!existingColumns.has('category_en')) {
        await addColumnIfMissing(env, 'ALTER TABLE gear_items ADD COLUMN category_en TEXT')
      }

      if (!existingColumns.has('description_en')) {
        await addColumnIfMissing(env, 'ALTER TABLE gear_items ADD COLUMN description_en TEXT')
      }

      if (imageUrlsAdded) {
        await env.DB.prepare(
          `
            UPDATE gear_items
            SET image_urls = CASE
              WHEN image_url IS NULL OR TRIM(image_url) = '' THEN NULL
              ELSE json_array(image_url)
            END
            WHERE image_urls IS NULL
          `,
        ).run()
      }

      gearItemsSchemaReady = true
    })().finally(() => {
      gearItemsSchemaPromise = null
    })
  }

  await gearItemsSchemaPromise
}
