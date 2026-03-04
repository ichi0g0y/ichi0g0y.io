type Mode = 'local' | 'remote'

interface GearRow {
  id: number
  title: string
  category: string
  description: string | null
  title_en: string | null
  category_en: string | null
  description_en: string | null
}

interface D1JsonResult<T> {
  results?: T[]
  success?: boolean
}

interface Translation {
  titleEn: string | null
  categoryEn: string | null
  descriptionEn: string | null
}

const DATABASE_NAME = 'ichi0g0y_portfolio'
const DEFAULT_MODEL = 'gpt-4.1-mini'
const TRANSLATE_TIMEOUT_MS = 15_000

function parseMode(args: string[]): Mode {
  if (args.includes('--remote')) {
    return 'remote'
  }
  return 'local'
}

function hasDryRun(args: string[]) {
  return args.includes('--dry-run')
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.toLowerCase() === 'null') {
    return null
  }
  return trimmed
}

function sqlString(value: string | null) {
  if (value === null) {
    return 'NULL'
  }
  return `'${value.replaceAll("'", "''")}'`
}

async function runWranglerD1<T>(mode: Mode, sql: string): Promise<D1JsonResult<T>> {
  const wranglerBin = `${process.cwd()}/node_modules/.bin/wrangler`
  const args = ['d1', 'execute', DATABASE_NAME, mode === 'remote' ? '--remote' : '--local', '--json', '--command', sql]
  const proc = Bun.spawn([wranglerBin, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`wrangler d1 execute failed (exit=${exitCode})\n${stderr || stdout}`)
  }

  const parsed = JSON.parse(stdout) as Array<D1JsonResult<T>>
  return parsed[0] ?? {}
}

async function fetchRowsToBackfill(mode: Mode): Promise<GearRow[]> {
  const sql = `
    SELECT id, title, category, description, title_en, category_en, description_en
    FROM gear_items
    WHERE
      title_en IS NULL OR TRIM(title_en) = '' OR LOWER(TRIM(title_en)) = 'null' OR
      category_en IS NULL OR TRIM(category_en) = '' OR LOWER(TRIM(category_en)) = 'null' OR
      description_en IS NULL OR TRIM(description_en) = '' OR LOWER(TRIM(description_en)) = 'null'
    ORDER BY sort_order ASC, id ASC
  `
  const result = await runWranglerD1<GearRow>(mode, sql)
  return (result.results ?? []).map((row) => ({
    ...row,
    description: normalizeText(row.description),
    title_en: normalizeText(row.title_en),
    category_en: normalizeText(row.category_en),
    description_en: normalizeText(row.description_en),
  }))
}

async function translateWithOpenAI(
  apiKey: string,
  model: string,
  source: { title: string; category: string; description: string | null },
): Promise<Translation> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS)

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
            content: JSON.stringify(source),
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { titleEn: null, categoryEn: null, descriptionEn: null }
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
      return { titleEn: null, categoryEn: null, descriptionEn: null }
    }

    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      titleEn: normalizeText(parsed.titleEn),
      categoryEn: normalizeText(parsed.categoryEn),
      descriptionEn: normalizeText(parsed.descriptionEn),
    }
  } catch {
    return { titleEn: null, categoryEn: null, descriptionEn: null }
  } finally {
    clearTimeout(timer)
  }
}

async function updateRow(
  mode: Mode,
  rowId: number,
  nextValues: { titleEn: string | null; categoryEn: string | null; descriptionEn: string | null },
) {
  const sql = `
    UPDATE gear_items
    SET
      title_en = ${sqlString(nextValues.titleEn)},
      category_en = ${sqlString(nextValues.categoryEn)},
      description_en = ${sqlString(nextValues.descriptionEn)},
      updated_at = strftime('%s', 'now')
    WHERE id = ${rowId}
  `
  await runWranglerD1(mode, sql)
}

async function main() {
  const args = Bun.argv.slice(2)
  const mode = parseMode(args)
  const dryRun = hasDryRun(args)
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY が未設定です。.dev.vars を読み込んで実行してください。')
  }

  const rows = await fetchRowsToBackfill(mode)
  if (rows.length < 1) {
    console.log(`[backfill] 対象なし mode=${mode}`)
    return
  }

  console.log(`[backfill] mode=${mode} target_rows=${rows.length} dry_run=${dryRun}`)

  let translatedCount = 0
  let updatedCount = 0
  let skippedCount = 0

  for (const row of rows) {
    const translated = await translateWithOpenAI(apiKey, model, {
      title: row.title,
      category: row.category,
      description: row.description,
    })
    translatedCount += 1

    const nextTitleEn = row.title_en ?? translated.titleEn
    const nextCategoryEn = row.category_en ?? translated.categoryEn
    const nextDescriptionEn = row.description_en ?? translated.descriptionEn

    const unchanged =
      nextTitleEn === row.title_en && nextCategoryEn === row.category_en && nextDescriptionEn === row.description_en

    if (unchanged) {
      skippedCount += 1
      console.log(`[skip] id=${row.id} title="${row.title}"`)
      continue
    }

    if (!dryRun) {
      await updateRow(mode, row.id, {
        titleEn: nextTitleEn,
        categoryEn: nextCategoryEn,
        descriptionEn: nextDescriptionEn,
      })
    }

    updatedCount += 1
    console.log(`[ok] id=${row.id} title="${row.title}"`)
  }

  const remainSql = `
    SELECT COUNT(*) AS missing_count
    FROM gear_items
    WHERE
      title_en IS NULL OR TRIM(title_en) = '' OR LOWER(TRIM(title_en)) = 'null' OR
      category_en IS NULL OR TRIM(category_en) = '' OR LOWER(TRIM(category_en)) = 'null' OR
      description_en IS NULL OR TRIM(description_en) = '' OR LOWER(TRIM(description_en)) = 'null'
  `
  const remainResult = await runWranglerD1<{ missing_count: number }>(mode, remainSql)
  const missingCount = Number(remainResult.results?.[0]?.missing_count ?? 0)

  console.log(
    `[summary] translated=${translatedCount} updated=${updatedCount} skipped=${skippedCount} missing_after=${missingCount}`,
  )
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
