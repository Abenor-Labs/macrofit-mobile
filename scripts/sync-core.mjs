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
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const webSrcCandidates = [
  path.resolve(projectRoot, '..', 'src'),
  path.resolve(projectRoot, '..', 'Macro-tracker', 'src'),
]
const webSrc = webSrcCandidates.find(candidate => existsSync(candidate))
const coreDir = path.resolve(projectRoot, 'src', 'core')

/** Only pure, platform-agnostic modules. Nothing here may touch the DOM or React. */
const ENTRIES = [
  { from: 'types', to: 'types' },
  { from: 'utils', to: 'utils' },
  { from: 'data', to: 'data' },
  { from: 'store/appState.ts', to: 'store/appState.ts' },
]

if (!webSrc) {
  console.error(`[sync-core] cannot find the web source. Tried: ${webSrcCandidates.join(', ')}`)
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

/*
  LF only. The web repo's checkout can hold CRLF files (Windows autocrlf), and copying those
  verbatim made git report them modified on every start and typecheck while nothing but the
  line endings differed. .gitattributes pins src/core to LF; this makes the copy match it.
*/
const normalise = async dir => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await normalise(full)
    else if (/\.(ts|tsx|js|json|md)$/.test(entry.name)) {
      const text = await readFile(full, 'utf8')
      if (text.includes('\r\n')) await writeFile(full, text.replace(/\r\n/g, '\n'))
    }
  }
}
await normalise(coreDir)

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
