import React, { useCallback, useEffect, useState } from 'react'
import { AppState, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { BellOff, ChevronRight } from 'lucide-react-native'

import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Screen } from '@/components/Layout'
import { Island } from '@/components/Material'
import { Body, Label } from '@/components/Text'
import { Button } from '@/components/Button'
import { useNotificationPrefs, type NotificationPrefs } from '@/store/notificationPrefs'
import { CHANNELS, ensureNotificationPermission } from '@/lib/notifications'
import { DAILY_CAP } from '@/lib/reminderPlan'

const HAIRLINE = StyleSheet.hairlineWidth * 2

type BoolKey = { [K in keyof NotificationPrefs]: NotificationPrefs[K] extends boolean ? K : never }[keyof NotificationPrefs]
type TimeKey = { [K in keyof NotificationPrefs]: NotificationPrefs[K] extends string ? K : never }[keyof NotificationPrefs]

/** '18:30' -> '6:30 pm' */
const formatTime = (value: string): string => {
  const [h, m] = value.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

const toDate = (value: string): Date => {
  const [h, m] = value.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

const fromDate = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

const inQuietHours = (value: string): boolean => {
  const h = Number(value.split(':')[0])
  return h >= 22 || h < 7
}

/**
 * Notification settings.
 *
 * One switch per notification, each with the rule it follows written underneath — "only for
 * a meal you haven't logged" is what makes someone willing to turn a reminder on. Times use
 * the platform's own picker. Everything saves as it changes; there is no Save button.
 */
export default function NotificationSettings() {
  const theme = useTheme()
  const prefs = useNotificationPrefs()
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus | null>(
    null
  )
  const [iosPicker, setIosPicker] = useState<TimeKey | null>(null)

  const refresh = useCallback(() => {
    void Notifications.getPermissionsAsync().then(setPermission)
  }, [])

  useEffect(() => {
    refresh()
    // Coming back from the system settings page is how permission usually changes.
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh())
    return () => sub.remove()
  }, [refresh])

  const blocked = permission !== null && !permission.granted

  const toggle = async (key: BoolKey, value: boolean) => {
    prefs.set({ [key]: value })
    if (value) {
      await ensureNotificationPermission()
      refresh()
    }
  }

  const pickTime = (key: TimeKey) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(prefs[key]),
        mode: 'time',
        is24Hour: false,
        onChange: (event, date) => {
          if (event.type === 'set' && date) prefs.set({ [key]: fromDate(date) })
        },
      })
    } else {
      setIosPicker(current => (current === key ? null : key))
    }
  }

  const sendTest = async () => {
    if (!(await ensureNotificationPermission())) {
      refresh()
      return
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'This is how MacroFit sounds',
        body: 'Reminders arrive like this. Rest alerts use the workout tone.',
        sound: 'reminder.wav',
        data: { kind: 'test' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        channelId: CHANNELS.reminders,
      },
    })
  }

  // A render function, not a component declared in here: a component defined inside the
  // render would remount every switch on each change and swallow the toggle animation.
  const row = ({
    k,
    title,
    rule,
    first,
    times,
  }: {
    k: BoolKey
    title: string
    rule: string
    first?: boolean
    times?: { key: TimeKey; label: string }[]
  }) => (
    <View key={k} style={{ borderTopWidth: first ? 0 : HAIRLINE, borderTopColor: theme.hairline }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          minHeight: 64,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Body weight="semibold">{title}</Body>
          <Body size={13} tone="muted">
            {rule}
          </Body>
        </View>
        <Switch
          value={prefs[k]}
          onValueChange={value => void toggle(k, value)}
          accessibilityLabel={title}
          trackColor={{ false: theme.trackMuted, true: theme.brand }}
          thumbColor={Platform.OS === 'android' ? theme.surface : undefined}
          ios_backgroundColor={theme.trackMuted}
        />
      </View>

      {prefs[k] && times
        ? times.map(({ key, label }) => (
            <View key={key}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}, ${formatTime(prefs[key])}. Change time`}
                onPress={() => pickTime(key)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: HIT_SIZE + 4,
                  paddingHorizontal: spacing.lg,
                  paddingLeft: spacing.lg + spacing.md,
                  backgroundColor: pressed ? theme.border : 'transparent',
                })}
              >
                <Body size={15} tone="secondary" style={{ flex: 1 }}>
                  {label}
                </Body>
                <Body size={15} weight="semibold" style={{ color: theme.brandText }}>
                  {formatTime(prefs[key])}
                </Body>
                <ChevronRight size={16} color={theme.textMuted} strokeWidth={2.2} />
              </Pressable>
              {inQuietHours(prefs[key]) ? (
                <Body
                  size={12}
                  style={{
                    color: theme.status.warning,
                    paddingHorizontal: spacing.lg + spacing.md,
                    paddingBottom: spacing.sm,
                  }}
                >
                  That is inside quiet hours (10 pm – 7 am), so it will not be sent.
                </Body>
              ) : null}
              {Platform.OS === 'ios' && iosPicker === key ? (
                <DateTimePicker
                  value={toDate(prefs[key])}
                  mode="time"
                  display="spinner"
                  onChange={(_, date) => date && prefs.set({ [key]: fromDate(date) })}
                />
              ) : null}
            </View>
          ))
        : null}
    </View>
  )

  return (
    <Screen title="Notifications" subtitle="What MacroFit tells you, and when" onBack={() => router.back()}>
      {blocked ? (
        <Island style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <BellOff size={18} color={theme.status.warning} strokeWidth={2} />
            <Body weight="semibold" style={{ flex: 1 }}>
              Notifications are off for MacroFit
            </Body>
          </View>
          <Body size={13} tone="secondary">
            Nothing below can reach you until they are allowed. The in-app rest timer still works.
          </Body>
          <Button
            label={permission?.canAskAgain ? 'Allow notifications' : 'Open settings'}
            onPress={async () => {
              if (permission?.canAskAgain) await ensureNotificationPermission()
              else await Linking.openSettings()
              refresh()
            }}
          />
        </Island>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Label style={{ marginLeft: spacing.xs }}>Workout</Label>
        <Island style={{ padding: 0, overflow: 'hidden', borderRadius: radius.card }}>
          {row({
            first: true,
            k: 'restOver',
            title: 'Rest over',
            rule: 'When your rest timer ends, even with the phone locked.',
          })}
          {row({
            k: 'workoutOpen',
            title: 'Workout left running',
            rule: 'After two hours without a ticked set.',
          })}
          {row({
            k: 'trainingDay',
            title: 'Training day',
            rule: "Your plan's day, with last time's numbers to beat. Skipped once you've trained.",
            times: [{ key: 'trainingDayTime', label: 'Remind me at' }],
          })}
          {row({
            k: 'streakRisk',
            title: 'Streak at risk',
            rule: "A weekend nudge when you're exactly one workout short.",
          })}
        </Island>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Label style={{ marginLeft: spacing.xs }}>Food and water</Label>
        <Island style={{ padding: 0, overflow: 'hidden', borderRadius: radius.card }}>
          {row({
            first: true,
            k: 'meals',
            title: 'Meal reminders',
            rule: "Only for a meal you haven't logged by then.",
            times: [
              { key: 'breakfastTime', label: 'Breakfast' },
              { key: 'lunchTime', label: 'Lunch' },
              { key: 'dinnerTime', label: 'Dinner' },
            ],
          })}
          {row({
            k: 'eveningCheck',
            title: 'Evening check',
            rule: "Today's calories and protein. Skipped when you're on target.",
            times: [{ key: 'eveningCheckTime', label: 'Send at' }],
          })}
          {row({
            k: 'water',
            title: 'Water',
            rule: "Only when you're behind for the day, with its own sound.",
          })}
        </Island>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Label style={{ marginLeft: spacing.xs }}>Body and app</Label>
        <Island style={{ padding: 0, overflow: 'hidden', borderRadius: radius.card }}>
          {row({
            first: true,
            k: 'weighIn',
            title: 'Weigh-in',
            rule: "Skipped on days you've already weighed in.",
            times: [{ key: 'weighInTime', label: 'Remind me at' }],
          })}
          {row({
            k: 'weeklyRecap',
            title: 'Weekly review',
            rule: "Monday at 9 am: last week's workouts, food and weight.",
          })}
          {row({
            k: 'updates',
            title: 'New versions',
            rule: "Once per release, with what's new.",
          })}
        </Island>
      </View>

      <Body size={12} tone="muted" style={{ textAlign: 'center', paddingHorizontal: spacing.md }}>
        {`Quiet from 10 pm to 7 am, and never more than ${DAILY_CAP} reminders a day. Each one is dropped the moment you've already done the thing it's about.`}
      </Body>

      <Button label="Send a test notification" variant="secondary" full onPress={() => void sendTest()} />
    </Screen>
  )
}
