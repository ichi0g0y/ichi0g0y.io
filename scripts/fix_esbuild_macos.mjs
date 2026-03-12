import { accessSync, constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

if (process.platform !== 'darwin') {
  process.exit(0)
}

const rootDir = process.cwd()
const candidates = [
  path.join(rootDir, 'node_modules/esbuild/bin/esbuild'),
  path.join(rootDir, 'node_modules/@esbuild/darwin-arm64/bin/esbuild'),
]

for (const target of candidates) {
  try {
    accessSync(target, constants.X_OK)
  } catch {
    continue
  }

  try {
    execFileSync('codesign', ['--force', '--sign', '-', target], { stdio: 'ignore' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`failed to codesign esbuild binary: ${target}`)
    console.warn(message)
  }
}
