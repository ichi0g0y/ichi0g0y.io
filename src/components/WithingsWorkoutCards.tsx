import { Icon } from '@iconify/react'

import type { AppLocale, WithingsWorkoutDetailPoint, WithingsWorkoutPoint } from '../types'
import { formatCalories, formatDistanceMeters, formatDuration, formatWorkoutDetailValue } from '../hooks/useWithings'
import {
  healthiconsExerciseBicycleOutline,
  healthiconsExerciseOutline,
  healthiconsWalkingOutline,
} from '../icons/healthicons'

type WorkoutLabels = {
  withingsRecentWorkoutsTitle: string
  withingsWorkoutDateLabel: string
  withingsWorkoutDistanceLabel: string
  withingsWorkoutCaloriesLabel: string
  withingsWorkoutDurationLabel: string
  withingsWorkoutStepsLabel: string
  withingsWorkoutIntensityLabel: string
}

type WithingsWorkoutCardsProps = {
  workouts: WithingsWorkoutPoint[]
  locale: AppLocale
  labels: WorkoutLabels
  formatWithingsMeasuredAt: (unixSeconds: number | null | undefined) => string
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function resolveWorkoutTone(workoutCategoryKey: string | null) {
  const key = workoutCategoryKey?.trim().toLowerCase() || ''
  if (key.includes('cycling') || key.includes('bike')) {
    return 'is-cycling'
  }
  if (key.includes('walking') || key.includes('running') || key.includes('hiking')) {
    return 'is-walking'
  }
  if (key.includes('game') || key.includes('fitness') || key.includes('boxing') || key.includes('martial')) {
    return 'is-game'
  }
  return 'is-generic'
}

function resolveWorkoutIcon(tone: string) {
  if (tone === 'is-cycling') {
    return healthiconsExerciseBicycleOutline
  }
  if (tone === 'is-game') {
    return healthiconsExerciseOutline
  }
  if (tone === 'is-walking') {
    return healthiconsWalkingOutline
  }
  return healthiconsExerciseOutline
}

function findDetail(
  detailByKey: Map<string, WithingsWorkoutDetailPoint>,
  ...keys: string[]
) {
  for (const key of keys) {
    const detail = detailByKey.get(key)
    if (detail) {
      return detail
    }
  }
  return null
}

function resolveDetailLabel(detail: WithingsWorkoutDetailPoint | null, fallback: string) {
  return detail ? formatWorkoutDetailValue(detail) : fallback
}

export function WithingsWorkoutCards({
  workouts,
  locale,
  labels,
  formatWithingsMeasuredAt,
}: WithingsWorkoutCardsProps) {
  const recentWorkouts = workouts.slice(0, 3)

  return (
    <div className="withings-workout-section">
      <p className="withings-metrics-title">{labels.withingsRecentWorkoutsTitle}</p>
      <div className="withings-workout-list">
        {recentWorkouts.map((workout) => {
          const tone = resolveWorkoutTone(workout.workoutCategoryKey)
          const typeLabel = locale === 'ja' ? workout.workoutCategoryLabelJa : workout.workoutCategoryLabelEn
          const whenLabel = formatWithingsMeasuredAt(workout.startAt ?? workout.measuredAt)
          const workoutDetails = Array.isArray(workout.details) ? workout.details : []
          const detailByKey = new Map(workoutDetails.map((detail) => [detail.key, detail] as const))
          const distanceLabel = resolveDetailLabel(
            findDetail(detailByKey, 'data.manual_distance', 'data.distance'),
            formatDistanceMeters(workout.distanceMeters),
          )
          const caloriesLabel = resolveDetailLabel(
            findDetail(detailByKey, 'data.manual_calories', 'data.calories'),
            formatCalories(workout.caloriesKcal),
          )
          const durationLabel = resolveDetailLabel(findDetail(detailByKey, 'data.duration'), formatDuration(workout.durationSec))
          const extraLabel =
            tone === 'is-cycling' || !isFiniteNumber(workout.steps) ? labels.withingsWorkoutIntensityLabel : labels.withingsWorkoutStepsLabel
          const intensityValue = isFiniteNumber(workout.intensity) ? Math.trunc(workout.intensity) : null
          const stepsValue = isFiniteNumber(workout.steps) ? Math.trunc(workout.steps) : null
          const extraValue =
            tone === 'is-cycling' || !isFiniteNumber(workout.steps)
              ? intensityValue !== null
                ? `${intensityValue}`
                : '-'
              : stepsValue !== null
                ? `${stepsValue}`
                : '-'

          return (
            <article key={workout.dataKey} className={`withings-workout-card ${tone}`}>
              <div className="withings-workout-card-head">
                <span className={`withings-workout-icon ${tone}`}>
                  <Icon icon={resolveWorkoutIcon(tone)} />
                </span>
                <div className="withings-workout-head-copy">
                  <p className="withings-workout-kicker">{labels.withingsWorkoutDateLabel}</p>
                  <p className="withings-workout-when">{whenLabel}</p>
                  <h3 className="withings-workout-title">{typeLabel}</h3>
                </div>
              </div>

              <dl className="withings-workout-stats">
                <div className="withings-workout-stat">
                  <dt>{labels.withingsWorkoutDistanceLabel}</dt>
                  <dd>{distanceLabel}</dd>
                </div>
                <div className="withings-workout-stat">
                  <dt>{labels.withingsWorkoutDurationLabel}</dt>
                  <dd>{durationLabel}</dd>
                </div>
                <div className="withings-workout-stat">
                  <dt>{labels.withingsWorkoutCaloriesLabel}</dt>
                  <dd>{caloriesLabel}</dd>
                </div>
                <div className="withings-workout-stat">
                  <dt>{extraLabel}</dt>
                  <dd>{extraValue}</dd>
                </div>
              </dl>
            </article>
          )
        })}
      </div>
    </div>
  )
}
