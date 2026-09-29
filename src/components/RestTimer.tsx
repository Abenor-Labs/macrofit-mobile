import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Minus, Plus, Timer, X } from 'lucide-react-native'

import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Body, StatValue } from './Text'
import { IconButton } from './Button'
import { ProgressTrack } from './MacroRing'
import { cancelRestOver, scheduleRestOver } from '@/lib/notifications'

const DEFAULT_REST_SECONDS = 120
const STEP_SECONDS = 30

const format = (total: number): string => {
  const safe = Math.max(0, Math.round(total))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export interface RestTimerProps {
  /** Changes whenever a working set is completed; that is what starts the countdown. */
  triggerKey: number
  /**
   * The set waiting after this rest, used as the notification's body. Read when the rest
   * starts and reused by +/-30s, so moving the notification never loses what it says.
   */
  nextLabel?: string
  onDismiss: () => void
}

/**
 * Rest countdown between sets.
 *
 * Driven by a wall-clock deadline rather than by decrementing a counter each tick: JS
 * timers drift and are throttled in the background, so a naive counter would under-report
 * rest by several seconds over a long set. Recomputing from `Date.now()` stays correct
 * even if the interval fires late or the screen sleeps.
 */
export const RestTimer: React.FC<RestTimerProps> = ({ triggerKey, nextLabel, onDismiss }) => {
  const theme = useTheme()
  const [target, setTarget] = useState(DEFAULT_REST_SECONDS)
  const [remaining, setRemaining] = useState(DEFAULT_REST_SECONDS)
  const deadlineRef = useRef<number>(0)
  const firedRef = useRef(false)

  // Restart whenever another set is completed.
  useEffect(() => {
    if (triggerKey === 0) return
    deadlineRef.current = Date.now() + target * 1000
    firedRef.current = false
    setRemaining(target)
    /*
      The system notification is what reaches a phone locked in a pocket; the interval below
      only runs while the app is open. With the app open, the notification handler keeps it
      silent, so the in-app buzz is still the only signal. Dismissing the timer, or the
      workout ending, unmounts this and takes the notification with it.
    */
    void scheduleRestOver(target, nextLabel)
    return () => {
      void cancelRestOver()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey])

  useEffect(() => {
    if (triggerKey === 0) return
    const id = setInterval(() => {
      const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000)
      setRemaining(left)
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      }
    }, 250)
    return () => clearInterval(id)
  }, [triggerKey])

  if (triggerKey === 0) return null

  const done = remaining <= 0
  const adjust = (delta: number) => {
    const next = Math.max(STEP_SECONDS, target + delta)
    setTarget(next)
    deadlineRef.current += delta * 1000
    const left = Math.max(0, (deadlineRef.current - Date.now()) / 1000)
    setRemaining(left)
    firedRef.current = false
    // Same identifier, so this moves the pending notification rather than adding one.
    if (left > 0) void scheduleRestOver(left, nextLabel)
    else void cancelRestOver()
  }

  return (
    <View
      style={{
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: done ? theme.status.good + '66' : theme.border,
        backgroundColor: done ? theme.status.good + '14' : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Timer size={15} color={done ? theme.status.good : theme.textSecondary} strokeWidth={2} />
        <Body size={12} weight="semibold" tone={done ? 'primary' : 'secondary'}>
          {done ? 'Rest complete' : 'Resting'}
        </Body>

        <View style={{ flex: 1 }} />

        <IconButton accessibilityLabel="Take 30 seconds off the rest" onPress={() => adjust(-STEP_SECONDS)}>
          <Minus size={16} color={theme.textSecondary} strokeWidth={2.2} />
        </IconButton>
        <StatValue size={20} accessibilityLabel={`${format(remaining)} of rest remaining`}>
          {format(remaining)}
        </StatValue>
        <IconButton accessibilityLabel="Add 30 seconds to the rest" onPress={() => adjust(STEP_SECONDS)}>
          <Plus size={16} color={theme.textSecondary} strokeWidth={2.2} />
        </IconButton>
        <IconButton accessibilityLabel="Dismiss the rest timer" onPress={onDismiss}>
          <X size={16} color={theme.textMuted} strokeWidth={2.2} />
        </IconButton>
      </View>

      <ProgressTrack
        progress={target > 0 ? 1 - remaining / target : 1}
        color={done ? theme.status.good : theme.brand}
        height={5}
      />
    </View>
  )
}
