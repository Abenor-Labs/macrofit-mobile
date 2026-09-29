import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowDown, ArrowUp, Moon, Plus, Trash2, X } from 'lucide-react-native'

import { useStore } from '@/store/useStore'
import { ThemeScope } from '@/theme/ThemeScope'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing, workoutTheme } from '@/theme/tokens'
import { GlassSurface, Surface } from '@/components/Glass'
import { Body, Label, SectionTitle } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { ActionSheet } from '@/components/ActionSheet'
import { Segmented } from '@/components/Segmented'
import { findLiftById } from '@/features/training/liftNames'

const HAIRLINE = StyleSheet.hairlineWidth * 2

const KIND_OPTIONS = [
  { value: 'train', label: 'Training day' },
  { value: 'rest', label: 'Rest day' },
] as const

/**
 * One day of a program: what it is called, whether it is a rest day, and its lifts in order.
 *
 * Every change writes straight to the store — there is no Save button to forget. Closing the
 * sheet is the only "done" there is, the same as Hevy's routine editor on a phone.
 */
const RoutineDayBody: React.FC = () => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { programId, dayId } = useLocalSearchParams<{ programId: string; dayId: string }>()

  const program = useStore(s => s.trainingPrograms.find(p => p.id === programId) ?? null)
  const customLifts = useStore(s => s.customLifts)
  const updateProgramDay = useStore(s => s.updateProgramDay)
  const moveProgramDay = useStore(s => s.moveProgramDay)
  const removeProgramDay = useStore(s => s.removeProgramDay)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const index = program?.days.findIndex(d => d.id === dayId) ?? -1
  const day = program && index >= 0 ? program.days[index] : null

  // The day was deleted (here, or on another device mid-edit): nothing left to show.
  useEffect(() => {
    if (day === null) router.back()
  }, [day])

  if (!program || !day) return null

  const update = (patch: Parameters<typeof updateProgramDay>[2]) =>
    updateProgramDay(program.id, day.id, patch)

  const moveLift = (from: number, to: number) => {
    if (to < 0 || to >= day.liftIds.length) return
    const next = [...day.liftIds]
    const [lift] = next.splice(from, 1)
    next.splice(to, 0, lift)
    update({ liftIds: next })
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <GlassSurface
        radius={0}
        bordered={false}
        style={{
          paddingTop: insets.top,
          borderBottomWidth: HAIRLINE,
          borderBottomColor: theme.glass.border,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
          }}
        >
          <IconButton
            accessibilityLabel="Close"
            onPress={() => router.back()}
            style={{ marginLeft: -spacing.md }}
          >
            <X size={22} color={theme.text} strokeWidth={2} />
          </IconButton>
          <View style={{ flex: 1 }}>
            <SectionTitle>{`Day ${index + 1} of ${program.days.length}`}</SectionTitle>
            <Body size={12} tone="muted" numberOfLines={1}>
              {program.name}
            </Body>
          </View>
        </View>
      </GlassSurface>

      <KeyboardAwareScrollView
        bottomOffset={spacing.xl}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: spacing.lg,
          gap: spacing.lg,
          paddingBottom: insets.bottom + spacing.xl,
        }}
      >
        <Segmented
          options={KIND_OPTIONS}
          value={day.rest ? 'rest' : 'train'}
          onChange={kind =>
            update(
              kind === 'rest'
                ? { rest: true, name: 'Rest' }
                : { rest: false, name: day.name === 'Rest' ? 'New day' : day.name }
            )
          }
        />

        {day.rest ? (
          <Surface style={{ padding: spacing.lg, gap: spacing.sm, alignItems: 'center' }}>
            <Moon size={28} color={theme.brandText} strokeWidth={2} />
            <Body weight="semibold">Rest day</Body>
            <Body size={13} tone="secondary" style={{ textAlign: 'center' }}>
              Nothing to log. It passes with the calendar and the plan moves on the next day.
            </Body>
          </Surface>
        ) : (
          <>
            <View style={{ gap: spacing.xs }}>
              <Label>Name</Label>
              <TextInput
                value={day.name}
                onChangeText={name => update({ name })}
                placeholder="e.g. Chest day"
                placeholderTextColor={theme.textMuted}
                accessibilityLabel="Day name"
                style={{
                  minHeight: 52,
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.control,
                  backgroundColor: theme.surfaceRaised,
                  fontFamily: fonts.displayBold,
                  fontSize: 20,
                  color: theme.text,
                }}
              />
            </View>

            <View style={{ gap: spacing.sm }}>
              <Label>{`Lifts · ${day.liftIds.length}`}</Label>
              {day.liftIds.length > 0 ? (
                <Surface>
                  {day.liftIds.map((liftId, position) => {
                    const lift = findLiftById(liftId, customLifts)
                    return (
                      <View
                        key={`${liftId}-${position}`}
                        style={{
                          minHeight: 60,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.xs,
                          paddingLeft: spacing.md,
                          borderTopWidth: position === 0 ? 0 : HAIRLINE,
                          borderTopColor: theme.border,
                        }}
                      >
                        <Body size={13} tone="muted" style={{ width: 20 }}>
                          {position + 1}
                        </Body>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Body weight="semibold" numberOfLines={1}>
                            {lift?.name ?? 'Unknown lift'}
                          </Body>
                          {lift ? (
                            <Body size={12} tone="muted" numberOfLines={1}>
                              {`${lift.muscleGroup} · ${lift.equipment}`}
                            </Body>
                          ) : null}
                        </View>
                        <IconButton
                          accessibilityLabel={`Move ${lift?.name ?? 'lift'} up`}
                          disabled={position === 0}
                          onPress={() => moveLift(position, position - 1)}
                        >
                          <ArrowUp size={17} color={theme.textSecondary} strokeWidth={2} />
                        </IconButton>
                        <IconButton
                          accessibilityLabel={`Move ${lift?.name ?? 'lift'} down`}
                          disabled={position === day.liftIds.length - 1}
                          onPress={() => moveLift(position, position + 1)}
                        >
                          <ArrowDown size={17} color={theme.textSecondary} strokeWidth={2} />
                        </IconButton>
                        <IconButton
                          accessibilityLabel={`Remove ${lift?.name ?? 'lift'}`}
                          onPress={() =>
                            update({ liftIds: day.liftIds.filter((_, i) => i !== position) })
                          }
                        >
                          <X size={17} color={theme.textMuted} strokeWidth={2} />
                        </IconButton>
                      </View>
                    )
                  })}
                </Surface>
              ) : (
                <Body size={13} tone="secondary">
                  No lifts yet. Add the ones you do on this day, in the order you do them.
                </Body>
              )}
              <Button
                label="Add lift"
                full
                onPress={() =>
                  router.push({
                    pathname: '/lift-picker',
                    params: { programId: program.id, dayId: day.id },
                  })
                }
                icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
              />
            </View>
          </>
        )}

        <View style={{ gap: spacing.sm }}>
          <Label>Position in the cycle</Label>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Earlier"
              variant="secondary"
              disabled={index === 0}
              onPress={() => moveProgramDay(program.id, day.id, -1)}
              icon={<ArrowUp size={16} color={theme.text} strokeWidth={2.2} />}
              style={{ flex: 1 }}
            />
            <Button
              label="Later"
              variant="secondary"
              disabled={index === program.days.length - 1}
              onPress={() => moveProgramDay(program.id, day.id, 1)}
              icon={<ArrowDown size={16} color={theme.text} strokeWidth={2.2} />}
              style={{ flex: 1 }}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => setConfirmDelete(true)}
          disabled={program.days.length <= 1}
          style={({ pressed }) => ({
            minHeight: HIT_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.control,
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          <Body
            weight="semibold"
            style={{
              color: program.days.length <= 1 ? theme.textMuted : theme.status.critical,
            }}
          >
            {program.days.length <= 1 ? 'A plan needs at least one day' : 'Delete this day'}
          </Body>
        </Pressable>
      </KeyboardAwareScrollView>

      <ActionSheet
        visible={confirmDelete}
        title={`Delete ${day.rest ? 'this rest day' : day.name}?`}
        message="Workouts you already logged from it stay in History."
        onClose={() => setConfirmDelete(false)}
        options={[
          {
            label: 'Delete day',
            icon: <Trash2 size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: () => removeProgramDay(program.id, day.id),
          },
        ]}
      />
    </View>
  )
}

export default function RoutineDayScreen() {
  return (
    <ThemeScope theme={workoutTheme}>
      <RoutineDayBody />
    </ThemeScope>
  )
}
