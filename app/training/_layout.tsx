import React, { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { Tabs } from 'expo-router'
import { CalendarDays, ChevronRight, Dumbbell, History, Trophy } from 'lucide-react-native'

import { useStore } from '@/store/useStore'
import { ThemeScope } from '@/theme/ThemeScope'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing, workoutTheme } from '@/theme/tokens'
import { GlassTabBar, type GlassTabBarProps } from '@/components/GlassTabBar'
import { Body, StatValue } from '@/components/Text'
import { formatElapsed } from '@/features/training/format'
import { useRestClock } from '@/features/training/restClock'
import { RestTimer } from '@/components/RestTimer'
import { sessionSetCount } from '@core/utils/workoutMath'

const ITEMS: GlassTabBarProps['items'] = {
  index: { label: 'Today', icon: Dumbbell },
  plan: { label: 'Plan', icon: CalendarDays },
  history: { label: 'History', icon: History },
  records: { label: 'Records', icon: Trophy },
}

/**
 * The running session, pinned above Training's tab bar on every tab but Today.
 *
 * JioSaavn's now-playing bar, for a workout: once a session is live, browsing the plan or
 * checking a record must not feel like leaving it. One tap goes back to the sets.
 */
const LiveStrip: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const theme = useTheme()
  const session = useStore(s => s.workoutLog.find(w => w.id === s.activeWorkoutId) ?? null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session])

  if (!session) return null
  const sets = sessionSetCount(session)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.name} in progress. Return to the workout`}
      onPress={onOpen}
      style={({ pressed }) => ({
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: radius.control,
        backgroundColor: theme.brand,
        opacity: pressed ? 0.9 : 1,
      })}
      needsOffscreenAlphaCompositing
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.tight,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.14)',
        }}
      >
        <Dumbbell size={18} color={theme.brandOn} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body weight="semibold" numberOfLines={1} style={{ color: theme.brandOn }}>
          {session.name}
        </Body>
        <StatValue size={12} color={theme.brandOn} style={{ opacity: 0.75 }}>
          {`${formatElapsed(Math.max(0, now - session.startedAt))} · ${sets} ${sets === 1 ? 'set' : 'sets'}`}
        </StatValue>
      </View>
      <Body size={13} weight="semibold" style={{ color: theme.brandOn }}>
        Resume
      </Body>
      <ChevronRight size={18} color={theme.brandOn} strokeWidth={2.4} />
    </Pressable>
  )
}

/**
 * The rest countdown, pinned to the bottom of Training.
 *
 * It used to render inline at the top of the workout, so ticking a set on the fourth
 * exercise started a timer scrolled out of sight. On the tab bar it is under the thumb on
 * every tab — where Hevy keeps it — and it survives switching tabs mid-rest.
 */
const PinnedRestTimer: React.FC = () => {
  const theme = useTheme()
  const key = useRestClock(state => state.key)
  const nextLabel = useRestClock(state => state.nextLabel)
  const dismiss = useRestClock(state => state.dismiss)
  const running = useStore(s => s.activeWorkoutId !== null)
  // A rest left running when the workout ended must not greet the next one.
  useEffect(() => {
    if (!running && key !== 0) dismiss()
  }, [running, key, dismiss])
  if (!running || key === 0) return null
  return (
    <View
      style={{
        marginHorizontal: spacing.md,
        marginTop: spacing.sm,
        borderRadius: radius.control,
        backgroundColor: theme.surfaceRaised,
      }}
    >
      <RestTimer triggerKey={key} nextLabel={nextLabel} onDismiss={dismiss} />
    </View>
  )
}

const TrainingTabs: React.FC = () => {
  const theme = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.canvas } }}
        tabBar={props => {
          const onToday = props.state.routes[props.state.index]?.name === 'index'
          return (
            <GlassTabBar
              {...props}
              items={ITEMS}
              accessory={
                <>
                  <PinnedRestTimer />
                  {onToday ? null : (
                    <LiveStrip onOpen={() => props.navigation.navigate('index')} />
                  )}
                </>
              }
            />
          )
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="plan" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="records" />
      </Tabs>
    </View>
  )
}

/**
 * Training: an app inside the app.
 *
 * Its own header with a back arrow, its own four tabs, its own always-dark palette — the way
 * JioTunes opens out of MyJio, or Instamart out of Swiggy. The scope sits above the whole
 * navigator so the tab bar, which renders outside the screens, is in the same room as them.
 */
export default function TrainingLayout() {
  return (
    <ThemeScope theme={workoutTheme}>
      <TrainingTabs />
    </ThemeScope>
  )
}
