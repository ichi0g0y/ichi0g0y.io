type Mode = 'local' | 'remote'

import { WITHINGS_PROJECTED_SUMMARY_TYPE_IDS, getWithingsMeasureTypeMeta } from '../worker/withings-measure-types'

interface D1JsonResult<T> {
  results?: T[]
  success?: boolean
}

interface TypeStatRow {
  type_id: number | null
  n: number
  groups: number
  first_at: number | null
  last_at: number | null
}

interface TotalsRow {
  measure_values: number
  groups: number
  first_at: number | null
  last_at: number | null
}

interface RawSourceRow {
  source: string
  n: number
  first_at: number | null
  last_at: number | null
}

const DATABASE_NAME = 'DB'

function parseMode(args: string[]): Mode {
  if (args.includes('--remote')) {
    return 'remote'
  }
  return 'local'
}

function parseEnv(args: string[]) {
  const envIndex = args.findIndex((arg) => arg === '--env')
  if (envIndex < 0) {
    return null
  }
  const env = args[envIndex + 1]
  return env?.trim() || null
}

function formatUnix(unix: number | null | undefined) {
  if (!unix || unix < 1) {
    return '-'
  }
  return new Date(unix * 1000).toISOString()
}

async function runWranglerD1<T>(mode: Mode, env: string | null, sql: string): Promise<D1JsonResult<T>> {
  const wranglerBin = `${process.cwd()}/node_modules/.bin/wrangler`
  const args = ['d1', 'execute', DATABASE_NAME, mode === 'remote' ? '--remote' : '--local', '--json', '--command', sql]
  if (env) {
    args.push('--env', env)
  }
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

async function main() {
  const args = Bun.argv.slice(2)
  const mode = parseMode(args)
  const env = parseEnv(args)

  const totalsResult = await runWranglerD1<TotalsRow>(
    mode,
    env,
    `
      SELECT
        COUNT(*) AS measure_values,
        COUNT(DISTINCT grpid) AS groups,
        MIN(measured_at) AS first_at,
        MAX(measured_at) AS last_at
      FROM withings_measure_values
    `,
  )
  const totals = totalsResult.results?.[0] ?? null

  const statsResult = await runWranglerD1<TypeStatRow>(
    mode,
    env,
    `
      SELECT
        type_id,
        COUNT(*) AS n,
        COUNT(DISTINCT grpid) AS groups,
        MIN(measured_at) AS first_at,
        MAX(measured_at) AS last_at
      FROM withings_measure_values
      GROUP BY type_id
      ORDER BY n DESC, type_id ASC
    `,
  )
  const stats = statsResult.results ?? []

  console.log(`[withings-analyze] mode=${mode} env=${env ?? '(default)'}`)
  if (!totals) {
    console.log('No data found in withings_measure_values')
    return
  }

  console.log(`total_measure_values=${totals.measure_values} groups=${totals.groups}`)
  console.log(`range=${formatUnix(totals.first_at)} -> ${formatUnix(totals.last_at)}`)
  console.log('')
  console.log('metric_key\tlabel_ja\tlabel_en\tcount\tgroups\tprojected\tfirst_at\tlast_at')

  const rawOnlyMetrics = new Set<string>()
  for (const row of stats) {
    const typeId = row.type_id
    if (typeId === null) {
      continue
    }
    const meta = getWithingsMeasureTypeMeta(typeId)
    const projected = WITHINGS_PROJECTED_SUMMARY_TYPE_IDS.has(typeId)
    if (!projected) {
      rawOnlyMetrics.add(meta.key)
    }
    console.log(
      `${meta.key}\t${meta.labelJa}\t${meta.labelEn}\t${row.n}\t${row.groups}\t${projected ? 'yes' : 'no'}\t${formatUnix(row.first_at)}\t${formatUnix(row.last_at)}`,
    )
  }

  console.log('')
  if (rawOnlyMetrics.size < 1) {
    console.log('raw_only_metrics=(none)')
  } else {
    console.log(`raw_only_metrics=${Array.from(rawOnlyMetrics).join(',')}`)
    console.log('hint: projected summary is currently [weight,fat_free_mass,fat_ratio,fat_mass_weight]')
  }

  let rawSourcesResult: D1JsonResult<RawSourceRow>
  try {
    rawSourcesResult = await runWranglerD1<RawSourceRow>(
      mode,
      env,
      `
        SELECT
          source,
          COUNT(DISTINCT data_key) AS n,
          MIN(measured_at) AS first_at,
          MAX(measured_at) AS last_at
        FROM withings_source_values
        GROUP BY source
        ORDER BY source ASC
      `,
    )
  } catch {
    rawSourcesResult = await runWranglerD1<RawSourceRow>(
      mode,
      env,
      `
        SELECT
          source,
          COUNT(*) AS n,
          MIN(measured_at) AS first_at,
          MAX(measured_at) AS last_at
        FROM withings_raw_data
        GROUP BY source
        ORDER BY source ASC
      `,
    )
  }
  const rawSources = rawSourcesResult.results ?? []
  console.log('')
  console.log('source\tcount\tfirst_at\tlast_at')
  for (const row of rawSources) {
    console.log(`${row.source}\t${row.n}\t${formatUnix(row.first_at)}\t${formatUnix(row.last_at)}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
