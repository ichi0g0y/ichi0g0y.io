import UPNG from 'upng-js'

import type { Env } from './types'

const CHART_WIDTH = 1200
const CHART_HEIGHT = 630
const ALLOWED_RANGES = new Set([7, 30, 90])
const PANEL_X = 24
const PANEL_Y = 24
const PANEL_WIDTH = CHART_WIDTH - PANEL_X * 2
const PANEL_HEIGHT = CHART_HEIGHT - PANEL_Y * 2
const PLOT_INSET_X = 56
const PLOT_INSET_TOP = 104
const PLOT_INSET_BOTTOM = 50
const PLOT_X = PANEL_X + PLOT_INSET_X
const PLOT_Y = PANEL_Y + PLOT_INSET_TOP
const PLOT_WIDTH = PANEL_WIDTH - PLOT_INSET_X * 2
const PLOT_HEIGHT = PANEL_HEIGHT - PLOT_INSET_TOP - PLOT_INSET_BOTTOM
const SUMMARY_Y = PANEL_Y + 34

const BITMAP_FONT: Record<string, string[]> = {
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  g: ['00000', '00000', '01111', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '10110', '11001', '10001', '10001', '10001'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  k: ['10000', '10001', '10010', '11100', '10010', '10001', '10001'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  t: ['00100', '00100', '11111', '00100', '00100', '00101', '00010'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  ':': ['00000', '00110', '00110', '00000', '00110', '00110', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00100', '01000', '10000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
}

type WeightRow = {
  measured_at: number
  weight_kg: number
  bmi: number | null
}

type RenderChartOptions = {
  rangeDays?: number
  userId?: string | null
}

type ChartPoint = {
  x: number
  y: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRange(rangeDays: number | null) {
  if (typeof rangeDays === 'number' && ALLOWED_RANGES.has(rangeDays)) {
    return rangeDays
  }
  return 30
}

function toByte(value: number) {
  return clamp(Math.round(value), 0, 255)
}

function blendPixel(buffer: Uint8Array, width: number, x: number, y: number, color: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= width || y >= buffer.length / 4 / width) {
    return
  }
  const index = (y * width + x) * 4
  const alpha = color[3] / 255
  const inverse = 1 - alpha
  buffer[index] = toByte(color[0] * alpha + buffer[index] * inverse)
  buffer[index + 1] = toByte(color[1] * alpha + buffer[index + 1] * inverse)
  buffer[index + 2] = toByte(color[2] * alpha + buffer[index + 2] * inverse)
  buffer[index + 3] = toByte(color[3] + buffer[index + 3] * inverse)
}

function fillRect(
  buffer: Uint8Array,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: [number, number, number, number],
) {
  const maxX = Math.min(width, x + rectWidth)
  const maxY = Math.min(buffer.length / 4 / width, y + rectHeight)
  for (let py = Math.max(0, y); py < maxY; py += 1) {
    for (let px = Math.max(0, x); px < maxX; px += 1) {
      blendPixel(buffer, width, px, py, color)
    }
  }
}

function fillBackground(buffer: Uint8Array, width: number, height: number) {
  fillRect(buffer, width, 0, 0, width, height, [8, 13, 25, 255])
}

function fillRoundedRect(
  buffer: Uint8Array,
  width: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  radius: number,
  color: [number, number, number, number],
) {
  const safeRadius = Math.max(0, Math.min(radius, Math.floor(rectWidth / 2), Math.floor(rectHeight / 2)))
  fillRect(buffer, width, x + safeRadius, y, rectWidth - safeRadius * 2, rectHeight, color)
  fillRect(buffer, width, x, y + safeRadius, rectWidth, rectHeight - safeRadius * 2, color)
  drawCircle(buffer, width, x + safeRadius, y + safeRadius, safeRadius, color)
  drawCircle(buffer, width, x + rectWidth - safeRadius - 1, y + safeRadius, safeRadius, color)
  drawCircle(buffer, width, x + safeRadius, y + rectHeight - safeRadius - 1, safeRadius, color)
  drawCircle(buffer, width, x + rectWidth - safeRadius - 1, y + rectHeight - safeRadius - 1, safeRadius, color)
}

function drawCircle(
  buffer: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: [number, number, number, number],
) {
  const radiusSq = radius * radius
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radiusSq) {
        blendPixel(buffer, width, x, y, color)
      }
    }
  }
}

function drawLine(
  buffer: Uint8Array,
  width: number,
  from: ChartPoint,
  to: ChartPoint,
  thickness: number,
  color: [number, number, number, number],
) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1)
  const radius = thickness / 2
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps
    const x = from.x + (to.x - from.x) * ratio
    const y = from.y + (to.y - from.y) * ratio
    drawCircle(buffer, width, x, y, radius, color)
  }
}

function buildChartPoints(rows: WeightRow[]) {
  const weights = rows.map((row) => row.weight_kg)
  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const padding = Math.max(0.35, (maxWeight - minWeight) * 0.18)
  const yMin = minWeight - padding
  const yMax = maxWeight + padding

  return rows.map((row, index) => {
    const xRatio = rows.length === 1 ? 0.5 : index / (rows.length - 1)
    const yRatio = yMax === yMin ? 0.5 : (row.weight_kg - yMin) / (yMax - yMin)
    return {
      x: PLOT_X + PLOT_WIDTH * xRatio,
      y: PLOT_Y + PLOT_HEIGHT - PLOT_HEIGHT * yRatio,
    }
  })
}

function formatWeightLabel(weightKg: number) {
  return weightKg.toFixed(1)
}

function formatChartDateLabel(measuredAt: number) {
  const date = new Date(measuredAt * 1000)
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '0'
  const day = parts.find((part) => part.type === 'day')?.value ?? '0'
  return `${year}-${month}-${day}`
}

function formatDeltaLabel(currentWeightKg: number, previousWeightKg: number | null) {
  if (previousWeightKg === null) {
    return null
  }

  const delta = currentWeightKg - previousWeightKg
  if (Math.abs(delta) < 0.05) {
    return '0.0'
  }
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
}

function formatBmiLabel(bmi: number | null) {
  if (typeof bmi !== 'number' || !Number.isFinite(bmi)) {
    return '--.-'
  }
  return bmi.toFixed(1)
}

function measureBitmapText(text: string, scale: number, letterSpacing: number) {
  let width = 0
  for (const char of text) {
    const glyph = BITMAP_FONT[char] ?? BITMAP_FONT['0']
    width += glyph[0].length * scale + letterSpacing
  }
  return Math.max(0, width - letterSpacing)
}

function drawBitmapText(
  buffer: Uint8Array,
  width: number,
  x: number,
  y: number,
  text: string,
  scale: number,
  letterSpacing: number,
  color: [number, number, number, number],
) {
  let cursorX = x
  for (const char of text) {
    const glyph = BITMAP_FONT[char] ?? BITMAP_FONT['0']
    for (let rowIndex = 0; rowIndex < glyph.length; rowIndex += 1) {
      const row = glyph[rowIndex]
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        if (row[columnIndex] !== '1') {
          continue
        }
        fillRect(
          buffer,
          width,
          cursorX + columnIndex * scale,
          y + rowIndex * scale,
          scale,
          scale,
          color,
        )
      }
    }
    cursorX += glyph[0].length * scale + letterSpacing
  }
}

function drawWeightMarkerLabel(
  buffer: Uint8Array,
  width: number,
  point: ChartPoint,
  title: string,
  subtitle: string | null,
  index: number,
  isLatest: boolean,
) {
  const titleScale = isLatest ? 4 : 3
  const titleLetterSpacing = 2
  const subtitleScale = 2
  const subtitleLetterSpacing = 2
  const titleWidth = measureBitmapText(title, titleScale, titleLetterSpacing)
  const titleHeight = 7 * titleScale
  const subtitleWidth = subtitle ? measureBitmapText(subtitle, subtitleScale, subtitleLetterSpacing) : 0
  const subtitleHeight = subtitle ? 7 * subtitleScale : 0
  const paddingX = isLatest ? 12 : 10
  const paddingY = isLatest ? 10 : 8
  const lineGap = subtitle ? 5 : 0
  const labelWidth = Math.max(titleWidth, subtitleWidth) + paddingX * 2
  const labelHeight = titleHeight + subtitleHeight + lineGap + paddingY * 2
  const preferredAbove = index % 2 === 0
  const aboveY = Math.round(point.y - labelHeight - 16)
  const belowY = Math.round(point.y + 16)
  const labelY = preferredAbove
    ? aboveY >= PANEL_Y + 12
      ? aboveY
      : belowY
    : belowY + labelHeight <= PANEL_Y + PANEL_HEIGHT - 12
      ? belowY
      : aboveY
  const labelX = Math.round(clamp(point.x - labelWidth / 2, PANEL_X + 12, PANEL_X + PANEL_WIDTH - labelWidth - 12))
  const labelBackground: [number, number, number, number] = isLatest ? [34, 197, 94, 255] : [15, 23, 42, 255]
  const labelTextColor: [number, number, number, number] = [248, 250, 252, 255]
  fillRoundedRect(buffer, width, labelX, labelY, labelWidth, labelHeight, 10, labelBackground)
  drawBitmapText(buffer, width, labelX + paddingX, labelY + paddingY, title, titleScale, titleLetterSpacing, labelTextColor)
  if (subtitle) {
    drawBitmapText(
      buffer,
      width,
      labelX + paddingX,
      labelY + paddingY + titleHeight + lineGap,
      subtitle,
      subtitleScale,
      subtitleLetterSpacing,
      labelTextColor,
    )
  }
}

function drawSummaryRow(buffer: Uint8Array, width: number, text: string) {
  const textScale = 3
  const letterSpacing = 2
  const textWidth = measureBitmapText(text, textScale, letterSpacing)
  const textX = Math.round(clamp(PANEL_X + (PANEL_WIDTH - textWidth) / 2, PANEL_X + 18, PANEL_X + PANEL_WIDTH - textWidth - 18))
  drawBitmapText(buffer, width, textX, SUMMARY_Y, text, textScale, letterSpacing, [226, 232, 240, 255])
}

async function resolveTargetUserId(env: Env, userId?: string | null) {
  if (userId?.trim()) {
    return userId.trim()
  }

  const withingsUser = await env.DB.prepare(
    `
      SELECT userid
      FROM withings_connections
      WHERE id = 1
      LIMIT 1
    `,
  ).first<{ userid: string }>()
  if (withingsUser?.userid) {
    return withingsUser.userid
  }

  const latestUser = await env.DB.prepare(
    `
      SELECT userid
      FROM withings_measurements
      WHERE weight_kg IS NOT NULL
      ORDER BY measured_at DESC
      LIMIT 1
    `,
  ).first<{ userid: string }>()
  return latestUser?.userid ?? null
}

async function loadWeightRows(env: Env, options: RenderChartOptions) {
  const targetUserId = await resolveTargetUserId(env, options.userId)
  if (!targetUserId) {
    return []
  }

  const rangeDays = normalizeRange(options.rangeDays ?? null)
  const cutoff = Math.floor(Date.now() / 1000) - rangeDays * 24 * 60 * 60
  const rows = await env.DB.prepare(
    `
      SELECT measured_at, weight_kg, bmi
      FROM withings_measurements
      WHERE userid = ?1
        AND weight_kg IS NOT NULL
        AND measured_at >= ?2
      ORDER BY measured_at ASC
    `,
  )
    .bind(targetUserId, cutoff)
    .all<WeightRow>()

  return rows.results ?? []
}

export async function renderWithingsChartPng(env: Env, options: RenderChartOptions = {}) {
  const rows = await loadWeightRows(env, options)
  if (rows.length < 1) {
    return null
  }

  const pixels = new Uint8Array(CHART_WIDTH * CHART_HEIGHT * 4)
  fillBackground(pixels, CHART_WIDTH, CHART_HEIGHT)
  fillRoundedRect(pixels, CHART_WIDTH, PANEL_X, PANEL_Y, PANEL_WIDTH, PANEL_HEIGHT, 20, [10, 18, 33, 236])
  fillRoundedRect(pixels, CHART_WIDTH, PANEL_X, PANEL_Y, PANEL_WIDTH, 1, 0, [51, 65, 85, 255])
  fillRoundedRect(pixels, CHART_WIDTH, PANEL_X, PANEL_Y + PANEL_HEIGHT - 1, PANEL_WIDTH, 1, 0, [51, 65, 85, 255])
  fillRoundedRect(pixels, CHART_WIDTH, PANEL_X, PANEL_Y, 1, PANEL_HEIGHT, 0, [51, 65, 85, 255])
  fillRoundedRect(pixels, CHART_WIDTH, PANEL_X + PANEL_WIDTH - 1, PANEL_Y, 1, PANEL_HEIGHT, 0, [51, 65, 85, 255])

  const gridY = Array.from({ length: 5 }, (_, index) => Math.round(PLOT_Y + (PLOT_HEIGHT / 4) * index))
  for (const y of gridY) {
    fillRect(pixels, CHART_WIDTH, PLOT_X, y, PLOT_WIDTH, 1, [42, 59, 84, 255])
  }

  const points = buildChartPoints(rows)
  const latestRow = rows.at(-1) ?? null
  if (latestRow) {
    drawSummaryRow(
      pixels,
      CHART_WIDTH,
      `${formatChartDateLabel(latestRow.measured_at)}  Weight:${formatWeightLabel(latestRow.weight_kg)}kg  BMI:${formatBmiLabel(latestRow.bmi)}  Delta:${formatDeltaLabel(latestRow.weight_kg, rows.length > 1 ? rows[rows.length - 2].weight_kg : null) ?? '0.0'}kg`,
    )
  }
  for (let index = 1; index < points.length; index += 1) {
    drawLine(pixels, CHART_WIDTH, points[index - 1], points[index], 8, [34, 211, 238, 86])
    drawLine(pixels, CHART_WIDTH, points[index - 1], points[index], 4, [56, 189, 248, 255])
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index]
    drawCircle(pixels, CHART_WIDTH, point.x, point.y, 7, [8, 47, 73, 255])
    drawCircle(pixels, CHART_WIDTH, point.x, point.y, 5, [125, 211, 252, 255])
    drawWeightMarkerLabel(pixels, CHART_WIDTH, point, formatWeightLabel(rows[index].weight_kg), null, index, false)
  }

  const latestPoint = points.at(-1)
  if (latestPoint) {
    drawCircle(pixels, CHART_WIDTH, latestPoint.x, latestPoint.y, 16, [34, 197, 94, 112])
    drawCircle(pixels, CHART_WIDTH, latestPoint.x, latestPoint.y, 9, [74, 222, 128, 255])
    drawCircle(pixels, CHART_WIDTH, latestPoint.x, latestPoint.y, 4, [240, 253, 244, 255])
    drawWeightMarkerLabel(
      pixels,
      CHART_WIDTH,
      latestPoint,
      formatWeightLabel(rows.at(-1)?.weight_kg ?? 0),
      null,
      points.length - 1,
      true,
    )
  }

  return new Uint8Array(UPNG.encode([pixels.buffer], CHART_WIDTH, CHART_HEIGHT, 0))
}

export async function handleWithingsChartPng(request: Request, env: Env) {
  const url = new URL(request.url)
  const rangeParam = Number.parseInt(url.searchParams.get('range') ?? '', 10)
  const png = await renderWithingsChartPng(env, { rangeDays: normalizeRange(Number.isFinite(rangeParam) ? rangeParam : null) })
  if (!png) {
    return new Response('No chart data', { status: 404 })
  }

  return new Response(png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
