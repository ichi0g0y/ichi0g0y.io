import { memo, useCallback, useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { AppLocale, WithingsWeightPoint } from '../types'

type WithingsTrendChartLabels = {
  title: string
  noData: string
  range7: string
  range30: string
  range90: string
  weight: string
  bmi: string
  fatRatio: string
}

type WithingsTrendChartProps = {
  points: WithingsWeightPoint[]
  locale: AppLocale
  labels: WithingsTrendChartLabels
}

type ChartPoint = {
  measuredAt: number
  weightKg: number | null
  bmi: number | null
  fatRatio: number | null
}

const RANGE_OPTIONS = [7, 30, 90] as const

function WithingsTrendChartComponent({ points, locale, labels }: WithingsTrendChartProps) {
  const [activeRangeDays, setActiveRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(90)
  const [rangeAnchorSec, setRangeAnchorSec] = useState(() => Math.floor(Date.now() / 1000))
  const latestMeasuredAt = useMemo(() => points.reduce((latest, point) => Math.max(latest, point.measuredAt), 0), [points])
  const effectiveRangeAnchorSec = Math.max(rangeAnchorSec, latestMeasuredAt)
  const rangeStart = useMemo(
    () => effectiveRangeAnchorSec - activeRangeDays * 24 * 60 * 60,
    [activeRangeDays, effectiveRangeAnchorSec],
  )

  const chartData = useMemo(() => {
    return points
      .filter((point) => point.measuredAt >= rangeStart)
      .map<ChartPoint>((point) => ({
        measuredAt: point.measuredAt,
        weightKg: typeof point.weightKg === 'number' && Number.isFinite(point.weightKg) ? point.weightKg : null,
        bmi: typeof point.bmi === 'number' && Number.isFinite(point.bmi) ? point.bmi : null,
        fatRatio: typeof point.fatRatio === 'number' && Number.isFinite(point.fatRatio) ? point.fatRatio : null,
      }))
      .sort((left, right) => left.measuredAt - right.measuredAt)
  }, [points, rangeStart])

  const axisDateFormatter = useCallback(
    (unixSeconds: number) =>
      new Date(unixSeconds * 1000).toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US', {
        month: 'numeric',
        day: 'numeric',
      }),
    [locale],
  )

  const tooltipLabelFormatter = useCallback(
    (unixSeconds: number) =>
      new Date(unixSeconds * 1000).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )

  const tooltipValueFormatter = useCallback(
    (value: number | string, name: string) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return ['-', name]
      }
      if (name === labels.weight) {
        return [`${value.toFixed(2)} kg`, name]
      }
      if (name === labels.bmi) {
        return [value.toFixed(2), name]
      }
      if (name === labels.fatRatio) {
        return [`${value.toFixed(2)} %`, name]
      }
      return [value.toFixed(2), name]
    },
    [labels.bmi, labels.fatRatio, labels.weight],
  )

  const renderWeightLabel = useCallback((props: { x?: unknown; y?: unknown; value?: unknown }) => {
    const { x, y, value } = props
    const parsedX = typeof x === 'number' ? x : Number(x)
    const parsedY = typeof y === 'number' ? y : Number(y)
    const parsedValue = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedValue)) {
      return null
    }
    return (
      <text
        x={parsedX}
        y={parsedY - 9}
        textAnchor="middle"
        fill="var(--withings-weight-label-color)"
        fontSize={10}
        fontWeight={700}
      >
        {parsedValue.toFixed(1)}
      </text>
    )
  }, [])

  const handleRangeChange = useCallback((nextRangeDays: (typeof RANGE_OPTIONS)[number]) => {
    setActiveRangeDays(nextRangeDays)
    setRangeAnchorSec(Math.floor(Date.now() / 1000))
  }, [])

  const tooltipContentStyle = useMemo(
    () => ({
      background: 'var(--withings-tooltip-bg)',
      color: 'var(--withings-tooltip-text)',
      border: 'none',
      borderRadius: '12px',
      boxShadow: 'var(--withings-tooltip-shadow)',
      padding: '0.52rem 0.62rem',
    }),
    [],
  )
  const tooltipLabelStyle = useMemo(
    () => ({
      color: 'var(--withings-tooltip-text)',
      fontSize: '0.72rem',
      fontWeight: 700,
      marginBottom: '0.2rem',
    }),
    [],
  )
  const tooltipItemStyle = useMemo(
    () => ({
      color: 'var(--withings-tooltip-text)',
      fontSize: '0.74rem',
      paddingTop: '0.08rem',
      paddingBottom: '0.08rem',
    }),
    [],
  )

  return (
    <div className="withings-trend">
      <div className="withings-trend-head">
        <p className="withings-metrics-title">{labels.title}</p>
        <div className="withings-trend-range" role="tablist" aria-label={labels.title}>
          {RANGE_OPTIONS.map((rangeDays) => {
            const rangeLabel =
              rangeDays === 7 ? labels.range7
              : rangeDays === 30 ? labels.range30
              : labels.range90

            return (
              <button
                key={rangeDays}
                type="button"
                role="tab"
                aria-selected={activeRangeDays === rangeDays}
                className={`withings-range-button${activeRangeDays === rangeDays ? ' is-active' : ''}`}
                onClick={() => handleRangeChange(rangeDays)}
              >
                {rangeLabel}
              </button>
            )
          })}
        </div>
      </div>
      {chartData.length < 2 ? (
        <p className="withings-empty-note">{labels.noData}</p>
      ) : (
        <div className="withings-trend-chart">
          <ResponsiveContainer width="100%" height={248} debounce={120}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(148,163,184,0.35)" />
              <XAxis
                dataKey="measuredAt"
                tickFormatter={axisDateFormatter}
                tickMargin={8}
                minTickGap={20}
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="weight"
                orientation="left"
                width={44}
                domain={['dataMin - 0.8', 'dataMax + 0.8']}
                tickFormatter={(value) => `${Number(value).toFixed(1)}`}
                stroke="#0ea5e9"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                yAxisId="ratio"
                orientation="right"
                width={44}
                domain={['dataMin - 1', 'dataMax + 1']}
                tickFormatter={(value) => `${Number(value).toFixed(0)}`}
                stroke="#f97316"
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                labelFormatter={(label) => tooltipLabelFormatter(Number(label))}
                formatter={(value, name) => tooltipValueFormatter(value as number | string, String(name))}
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle}
                itemStyle={tooltipItemStyle}
              />
              <Line
                yAxisId="weight"
                type="monotone"
                name={labels.weight}
                dataKey="weightKg"
                stroke="#0ea5e9"
                strokeWidth={2.8}
                dot={{ r: 3.2, strokeWidth: 0, fill: '#0ea5e9' }}
                activeDot={{ r: 4 }}
                label={renderWeightLabel}
                connectNulls={false}
                isAnimationActive="auto"
                animationDuration={320}
                animationEasing="ease-out"
              />
              <Line
                yAxisId="ratio"
                type="monotone"
                name={labels.fatRatio}
                dataKey="fatRatio"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive="auto"
                animationDuration={320}
                animationEasing="ease-out"
              />
              <Line
                yAxisId="ratio"
                type="monotone"
                name={labels.bmi}
                dataKey="bmi"
                stroke="#22c55e"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
                isAnimationActive="auto"
                animationDuration={320}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="withings-trend-legend" aria-label={labels.title}>
            <span className="withings-trend-legend-item">
              <span className="withings-trend-legend-line is-weight" aria-hidden="true" />
              <span className="withings-trend-legend-text">{labels.weight}</span>
            </span>
            <span className="withings-trend-legend-item">
              <span className="withings-trend-legend-line is-fat-ratio" aria-hidden="true" />
              <span className="withings-trend-legend-text">{labels.fatRatio}</span>
            </span>
            <span className="withings-trend-legend-item">
              <span className="withings-trend-legend-line is-bmi" aria-hidden="true" />
              <span className="withings-trend-legend-text">{labels.bmi}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export const WithingsTrendChart = memo(WithingsTrendChartComponent)
