#!/usr/bin/env node
/**
 * Copies the web app's pure business logic into mobile/src/core.
 *
 * WHY A COPY RATHER THAN A METRO watchFolder:
 * Metro will not reliably resolve modules from outside the project root, and more
 * importantly EAS Build uploads only this directory — anything living at ../src simply
 * would not exist in a cloud build. Vendoring on demand keeps the mobile project
 * self-contained while leaving ../src the single source of truth.
 *
 * src/core is generated and git-ignored. Never edit it by hand: run `npm run sync:core`
 * (start / typecheck / export all do this automatically).
 *
 * The directory layout is preserved exactly so the relative imports inside the copied
 * files (./calculations, ../types) keep resolving without rewriting a single line.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const webSrc = path.resolve(projectRoot, '..', 'src')
const coreDir = path.resolve(projectRoot, 'src', 'core')

/** Only pure, platform-agnostic modules. Nothing here may touch the DOM or React. */
const ENTRIES = [
  { from: 'types', to: 'types' },
  { from: 'utils', to: 'utils' },
  { from: 'data', to: 'data' },
  { from: 'store/appState.ts', to: 'store/appState.ts' },
]

if (!existsSync(webSrc)) {
  console.error(`[sync-core] cannot find the web source at ${webSrc}`)
  process.exit(1)
}

await rm(coreDir, { recursive: true, force: true })
await mkdir(coreDir, { recursive: true })

for (const entry of ENTRIES) {
  const from = path.join(webSrc, entry.from)
  const to = path.join(coreDir, entry.to)
  if (!existsSync(from)) {
    console.error(`[sync-core] missing ${from}`)
    process.exit(1)
  }
  await mkdir(path.dirname(to), { recursive: true })
  await cp(from, to, { recursive: true })
}

await writeFile(
  path.join(coreDir, 'README.md'),
  [
    '# Generated — do not edit',
    '',
    'Copied from `../../../src` by `scripts/sync-core.mjs`.',
    'Edit the originals in the web app and re-run `npm run sync:core`.',
    '',
  ].join('\n'),
)

console.log(`[sync-core] vendored ${ENTRIES.length} entries into src/core`)
