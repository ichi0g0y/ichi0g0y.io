import type { Env } from './types'

const OPENAI_TRANSLATE_TIMEOUT_MS = 15_000
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'

export interface EnglishTranslation {
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

export async function translateToEnglishWithOpenAI(
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
