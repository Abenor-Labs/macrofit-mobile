import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { Award, CalendarCheck, Flame, Target, Trophy } from 'lucide-react-native'

import { formatDate, getTodayString } from '@core/utils/calculations'
import { addDays } from '@core/utils/trainingProgram'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Screen, EmptyState } from '@/components/Layout'
import { Island } from '@/components/Material'
import { Body, Label } from '@/components/Text'
import { useActivityFeed } from '@/hooks/useActivityFeed'
import { useActivitySeen } from '@/store/activitySeen'
import type { FeedItem, FeedKind } from '@/lib/activityFeed'

const HAIRLINE = StyleSheet.hairlineWidth * 2

const ICONS: Record<FeedKind, typeof Trophy> = {
  pr: Trophy,
  milestone: Award,
  goal: Flame,
  coach: Target,
  recap: CalendarCheck,
}

const dateOf = (at: number): string => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "Today", "Yesterday", or the date — how a person refers to when something happened. */
const whenLabel = (at: number, today: string): string => {
  const date = dateOf(at)
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  return formatDate(date)
}

/**
 * Activity: what you've achieved, newest first.
 *
 * Opened from the bell on Today, which carries a dot while there is something new. Everything
 * here is worked out from the log (see lib/activityFeed), so it cannot drift from the data and
 * needs nothing kept in sync. Opening it marks everything read.
 */
export default function ActivityScreen() {
  const theme = useTheme()
  const today = getTodayString()
  const { items } = useActivityFeed()
  const markSeen = useActivitySeen(s => s.markSeen)

  /*
    What was new when the screen opened stays marked new while it is on screen; the read mark
    lands for next time. Both wait for the saved "seen up to" to load: opened cold from a
    notification, marking first would be overwritten by the older stored value a moment later
    (leaving the bell's dot stuck on), and every item would read as new.
  */
  const [newSince, setNewSince] = useState<number | null>(null)
  useEffect(() => {
    const start = () => {
      setNewSince(useActivitySeen.getState().seenUpTo)
      markSeen(Date.now())
    }
    if (useActivitySeen.persist.hasHydrated()) {
      start()
      return
    }
    return useActivitySeen.persist.onFinishHydration(start)
  }, [markSeen])

  const groups = useMemo(() => {
    const out: { label: string; items: FeedItem[] }[] = []
    for (const item of items) {
      const label = whenLabel(item.at, today)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    }
    return out
  }, [items, today])

  return (
    <Screen title="Activity" subtitle="Records, milestones and your weeks" onBack={() => router.back()}>
      {items.length === 0 ? (
        <Island style={{ padding: spacing.lg }}>
          <EmptyState
            icon={<Trophy size={26} color={theme.textMuted} strokeWidth={1.8} />}
            title="Nothing here yet"
            message="Personal records, milestones, weekly goals and your Monday recap will collect here as you log."
          />
        </Island>
      ) : (
        groups.map(group => (
          <View key={group.label} style={{ gap: spacing.sm }}>
            <Label style={{ marginLeft: spacing.xs }}>{group.label}</Label>
            <Island style={{ padding: 0, overflow: 'hidden', borderRadius: radius.card }}>
              {group.items.map((item, index) => {
                const Icon = ICONS[item.kind]
                const fresh = newSince !== null && item.at > newSince
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${fresh ? 'New. ' : ''}${item.title}. ${item.body}`}
                    // navigate, not push: several of these are tabs (Progress), and pushing a tab
                    // from a root screen stacks a second copy of the whole tab navigator.
                    onPress={() => router.navigate(item.url as never)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.md,
                      minHeight: 64,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      borderTopWidth: index === 0 ? 0 : HAIRLINE,
                      borderTopColor: theme.hairline,
                      backgroundColor: pressed ? theme.border : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: radius.tight,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: `${theme.brand}1F`,
                      }}
                    >
                      <Icon size={18} color={theme.brandText} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Body weight="semibold" numberOfLines={1}>
                        {item.title}
                      </Body>
                      <Body size={13} tone="secondary" numberOfLines={2}>
                        {item.body}
                      </Body>
                    </View>
                    {fresh ? (
                      <View
                        accessibilityElementsHidden
                        style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: theme.brand }}
                      />
                    ) : null}
                  </Pressable>
                )
              })}
            </Island>
          </View>
        ))
      )}
    </Screen>
  )
}
