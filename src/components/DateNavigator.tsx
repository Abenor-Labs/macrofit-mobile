import React from 'react'
import { View } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { formatDate, getDateString } from '@core/utils/calculations'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { Surface } from './Glass'
import { Body, SectionTitle } from './Text'
import { Button, IconButton } from './Button'

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/**
 * Parses 'YYYY-MM-DD' into a *local* Date.
 *
 * `new Date('2026-07-27')` parses as UTC midnight and then renders in local time, which
 * silently shows the previous day west of Greenwich. Splitting the parts avoids that.
 */
export const parseISODate = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export const shiftISODate = (iso: string, days: number): string => {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return getDateString(date)
}

/**
 * Previous / next day with a way straight back to today.
 *
 * Lifted out of the Diary, which owned the only copy, so the Dashboard could show a past day
 * without a second navigator being written that drifts from this one. Both screens ask the
 * same question — "which day am I looking at" — and there is no reason for them to answer it
 * with different controls.
 *
 * "Jump to today" only appears off-today. On today it would be a button that does nothing,
 * and the relative label underneath already says where you are.
 */
export const DateNavigator: React.FC<{
  date: string
  today: string
  onChange: (next: string) => void
}> = ({ date, today, onChange }) => {
  const theme = useTheme()
  const isToday = date === today
  /*
    The forward chevron clamps rather than disables.

    A day that has not happened cannot have been eaten, so walking the diary into next week
    only produces "Nothing logged for breakfast yet" for days that were never going to have
    anything. But `today` is a prop, recomputed only when a consumer re-renders — leave this
    screen open across midnight and it still says yesterday. Disabling the control on that
    stale value pinned the user to yesterday with "Jump to today" also hidden, and every
    subsequent log landing on the wrong date. Clamping keeps the tap live, and the tap is what
    forces the re-render that corrects `today`.
  */
  const atUpperBound = date >= today
  const relative = isToday
    ? 'Today'
    : date === shiftISODate(today, -1)
      ? 'Yesterday'
      : date === shiftISODate(today, 1)
        ? 'Tomorrow'
        : WEEKDAYS[parseISODate(date).getDay()]
  const spoken = `${relative}, ${formatDate(date)}`

  return (
    <Surface style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <IconButton
          accessibilityLabel="Show the previous day"
          onPress={() => onChange(shiftISODate(date, -1))}
        >
          <ChevronLeft size={22} color={theme.text} strokeWidth={2} />
        </IconButton>

        <View
          style={{ flex: 1, alignItems: 'center', gap: 2 }}
          accessible
          accessibilityLabel={spoken}
        >
          <SectionTitle>{formatDate(date)}</SectionTitle>
          <Body size={12} tone={isToday ? 'brand' : 'muted'} weight="medium">
            {relative}
          </Body>
        </View>

        <IconButton
          accessibilityLabel={
            atUpperBound
              ? 'Show the next day. Already on the latest day.'
              : 'Show the next day'
          }
          onPress={() => {
            const next = shiftISODate(date, 1)
            // Recomputed at press time, not read from the prop, so a screen left open across
            // midnight resolves to the real today rather than to the value it rendered with.
            const limit = getDateString(new Date())
            onChange(next > limit ? limit : next)
          }}
        >
          <ChevronRight
            size={22}
            color={atUpperBound ? theme.textMuted : theme.text}
            strokeWidth={2}
          />
        </IconButton>
      </View>

      {!isToday && (
        <Button label="Jump to today" variant="secondary" full onPress={() => onChange(today)} />
      )}
    </Surface>
  )
}
