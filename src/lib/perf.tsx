import React, { Profiler } from 'react'

/**
 * Render timing on a real phone, at production speed. On only in a build made with
 * EXPO_PUBLIC_PERF=1 (scripts/perf-run.mjs does that): the variable is inlined at build time,
 * so a release bundle carries no probe and no Profiler.
 *
 * Lines look like `[perf] diary update 12.3ms @4521 +140ms after diary`: which subtree, which
 * phase, render time, commit time since JS start, and time since the last tap marked with
 * markPress().
 */
export const PERF = process.env.EXPO_PUBLIC_PERF === '1'

let pressAt = 0
let pressName = ''

export const markPress = (name: string): void => {
  if (!PERF) return
  pressAt = performance.now()
  pressName = name
  console.log(`[perf] press ${name}`)
}

const onRender = (id: string, phase: string, actual: number, _base: number, _start: number, commit: number): void => {
  const since = pressAt ? ` +${Math.round(commit - pressAt)}ms after ${pressName}` : ''
  console.log(`[perf] ${id} ${phase} ${actual.toFixed(1)}ms @${Math.round(commit)}${since}`)
}

export const PerfProbe: React.FC<{ id: string; children: React.ReactNode }> = PERF
  ? ({ id, children }) => (
      <Profiler id={id} onRender={onRender}>
        {children}
      </Profiler>
    )
  : ({ children }) => <>{children}</>
