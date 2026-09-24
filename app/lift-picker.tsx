import React, { useMemo, useState } from 'react'
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Check, Dumbbell, History, Plus, Search, X } from 'lucide-react-native'

import type { Lift, LiftEquipment, MuscleGroup } from '@core/types'
import { LIFT_DATABASE, searchLifts } from '@core/data/exerciseDatabase'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing, workoutTheme } from '@/theme/tokens'
import { ThemeScope } from '@/theme/ThemeScope'
import { GlassSurface, Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button } from '@/components/Button'
import { EmptyState, Field } from '@/components/Layout'

const MUSCLE_GROUPS: MuscleGroup[] = [
  'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Full Body',
]

const EQUIPMENT: LiftEquipment[] = [
  'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell', 'Band',
]

const FREQUENT_COUNT = 6

interface ChipProps {
  label: string
  active: boolean
  onPress: () => void
  /** Screen-reader wording, since "Chest" alone does not say what it does. */
  accessibilityLabel: string
}

const Chip: React.FC<ChipProps> = ({ label, active, onPress, accessibilityLabel }) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        minHeight: HIT_SIZE,
        justifyContent: 'center',
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: active ? theme.brand : theme.border,
        backgroundColor: active ? theme.brand : theme.surface,
      }}
    >
      <Body size={13} weight="semibold" style={{ color: active ? theme.brandOn : theme.textSecondary }}>
        {label}
      </Body>
    </Pressable>
  )
}

const LiftRow: React.FC<{ lift: Lift; onPress: () => void }> = ({ lift, onPress }) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add ${lift.name}, ${lift.muscleGroup}, ${lift.equipment}${lift.isCustom ? ', custom lift' : ''}`}
      onPress={onPress}
    >
      <Surface
        style={{
          minHeight: HIT_SIZE,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.tight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.border,
          }}
        >
          <Dumbbell size={16} color={theme.textSecondary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight="medium" numberOfLines={1}>
            {lift.name}
          </Body>
          <Body size={12} tone="muted" numberOfLines={1}>
            {`${lift.muscleGroup} · ${lift.equipment}${lift.isCustom ? ' · Custom' : ''}`}
          </Body>
        </View>
        <Plus size={18} color={theme.brandText} strokeWidth={2.2} />
      </Surface>
    </Pressable>
  )
}

/**
 * Full-screen lift chooser, presented as a modal from the workout logger.
 *
 * The chosen lift is written straight into the in-progress session through the
 * store, so navigating here and back never touches the session itself — nothing
 * in flight can be lost by opening the picker.
 */
function LiftPickerBody() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ sessionId?: string; programId?: string; dayId?: string }>()

  const customLifts = useStore(s => s.customLifts)
  const workoutLog = useStore(s => s.workoutLog)
  const activeWorkoutId = useStore(s => s.activeWorkoutId)
  const addCustomLift = useStore(s => s.addCustomLift)
  const addExerciseToWorkout = useStore(s => s.addExerciseToWorkout)
  const updateProgramDay = useStore(s => s.updateProgramDay)
  // Opened from a program day's editor: the pick goes into that day, not into a session.
  const pickingProgram = useStore(
    s => s.trainingPrograms.find(p => p.id === params.programId) ?? null
  )
  const pickingDay = pickingProgram?.days.find(d => d.id === params.dayId) ?? null
  const programDay =
    pickingProgram && pickingDay ? { program: pickingProgram, day: pickingDay } : null

  // The param is the source of truth; activeWorkoutId is the fallback for a
  // deep link or a cold start into this modal.
  const sessionId = params.sessionId ?? activeWorkoutId

  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  // A calisthenics plan opens on bodyweight lifts; the filter is one tap to clear.
  const [equipment, setEquipment] = useState<LiftEquipment | 'all'>(() =>
    programDay?.program.style === 'calisthenics' ? 'Bodyweight' : 'all'
  )

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState<MuscleGroup>('Chest')
  const [newEquipment, setNewEquipment] = useState<LiftEquipment>('Barbell')
  const [newIsCompound, setNewIsCompound] = useState(false)
  const [nameError, setNameError] = useState('')

  const filtersActive = query.trim() !== '' || muscle !== 'all' || equipment !== 'all'

  /** Most-trained lifts first, ties broken by recency — workoutLog is newest first. */
  const frequentLifts = useMemo(() => {
    const seen = new Map<string, { lift: Lift; count: number; order: number }>()
    let order = 0
    for (const session of workoutLog) {
      for (const exercise of session.exercises ?? []) {
        if (!exercise.lift) continue
        const found = seen.get(exercise.liftId)
        if (found) found.count += 1
        else seen.set(exercise.liftId, { lift: exercise.lift, count: 1, order: order++ })
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .slice(0, FREQUENT_COUNT)
      .map(entry => entry.lift)
  }, [workoutLog])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    // Custom lifts are not in LIFT_DATABASE, so they are matched separately and
    // listed first — a lift the user created by hand is the one they wanted.
    const custom = customLifts.filter(
      lift =>
        needle === '' ||
        lift.name.toLowerCase().includes(needle) ||
        lift.muscleGroup.toLowerCase().includes(needle) ||
        lift.equipment.toLowerCase().includes(needle)
    )
    const presets = searchLifts(query, LIFT_DATABASE.length)
    return [...custom, ...presets].filter(
      lift =>
        (muscle === 'all' || lift.muscleGroup === muscle) &&
        (equipment === 'all' || lift.equipment === equipment)
    )
  }, [query, muscle, equipment, customLifts])

  const handleSelect = (lift: Lift) => {
    if (programDay) {
      const { program, day } = programDay
      if (!day.liftIds.includes(lift.id)) {
        updateProgramDay(program.id, day.id, { liftIds: [...day.liftIds, lift.id] })
      }
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else if (sessionId) {
      addExerciseToWorkout(sessionId, lift)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    router.back()
  }

  const handleCreate = () => {
    const name = newName.trim()
    if (name === '') {
      setNameError('Give the lift a name so you can find it again.')
      return
    }
    const lift = addCustomLift({
      name,
      muscleGroup: newMuscle,
      equipment: newEquipment,
      isCompound: newIsCompound,
    })
    handleSelect(lift)
  }

  const startCreating = () => {
    setNewName(query.trim())
    setNameError('')
    setCreating(true)
  }

  const listPadding = {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: insets.bottom + spacing.xxl,
    gap: spacing.sm,
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      {/* A picker is a sheet: this is one of the places glass belongs. */}
      <GlassSurface
        radius={0}
        bordered={false}
        style={{
          paddingTop: insets.top,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth * 2,
          borderBottomColor: theme.glass.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close lift picker"
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: HIT_SIZE,
              height: HIT_SIZE,
              marginLeft: -spacing.md,
              borderRadius: radius.control,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? theme.border : 'transparent',
            })}
          >
            <X size={22} color={theme.text} strokeWidth={2} />
          </Pressable>
          <SectionTitle>Add exercise</SectionTitle>
        </View>

        <View style={{ justifyContent: 'center' }}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search lifts, muscles or equipment…"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Search lifts"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              minHeight: HIT_SIZE,
              borderRadius: radius.control,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              color: theme.text,
              paddingLeft: 38,
              paddingRight: HIT_SIZE,
              fontFamily: fonts.body,
              fontSize: 16,
            }}
          />
          <View
            pointerEvents="none"
            style={{ position: 'absolute', left: 12, width: 18, alignItems: 'center' }}
          >
            <Search size={16} color={theme.textMuted} strokeWidth={2} />
          </View>
          {query !== '' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery('')}
              style={{
                position: 'absolute',
                right: 0,
                width: HIT_SIZE,
                height: HIT_SIZE,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={16} color={theme.textMuted} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          <Chip
            label="All muscles"
            active={muscle === 'all'}
            accessibilityLabel="Show every muscle group"
            onPress={() => setMuscle('all')}
          />
          {MUSCLE_GROUPS.map(group => (
            <Chip
              key={group}
              label={group}
              active={muscle === group}
              accessibilityLabel={`Filter by ${group}`}
              onPress={() => setMuscle(muscle === group ? 'all' : group)}
            />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
        >
          <Chip
            label="All equipment"
            active={equipment === 'all'}
            accessibilityLabel="Show every kind of equipment"
            onPress={() => setEquipment('all')}
          />
          {EQUIPMENT.map(item => (
            <Chip
              key={item}
              label={item}
              active={equipment === item}
              accessibilityLabel={`Filter by ${item}`}
              onPress={() => setEquipment(equipment === item ? 'all' : item)}
            />
          ))}
        </ScrollView>
      </GlassSurface>

      {creating ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listPadding}
          showsVerticalScrollIndicator={false}
        >
          <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
            <SectionTitle>Create a custom lift</SectionTitle>

            <View style={{ gap: 6 }}>
              <Field
                label="Name"
                value={newName}
                onChangeText={text => {
                  setNewName(text)
                  setNameError('')
                }}
                placeholder="e.g. Reverse Nordic Curl"
                accessibilityLabel="Custom lift name"
              />
              {nameError !== '' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <X size={14} color={theme.status.critical} strokeWidth={2.4} />
                  <Body size={12} weight="medium" style={{ color: theme.status.critical, flex: 1 }}>
                    {nameError}
                  </Body>
                </View>
              )}
            </View>

            <View style={{ gap: spacing.sm }}>
              <Label>Muscle group</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {MUSCLE_GROUPS.map(group => (
                  <Chip
                    key={group}
                    label={group}
                    active={newMuscle === group}
                    accessibilityLabel={`Muscle group ${group}`}
                    onPress={() => setNewMuscle(group)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <Label>Equipment</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {EQUIPMENT.map(item => (
                  <Chip
                    key={item}
                    label={item}
                    active={newEquipment === item}
                    accessibilityLabel={`Equipment ${item}`}
                    onPress={() => setNewEquipment(item)}
                  />
                ))}
              </View>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: newIsCompound }}
              accessibilityLabel="Compound lift, moves more than one joint"
              onPress={() => setNewIsCompound(value => !value)}
              style={{
                minHeight: HIT_SIZE,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: newIsCompound ? theme.brand : theme.border,
                  backgroundColor: newIsCompound ? theme.brand : 'transparent',
                }}
              >
                {newIsCompound && <Check size={16} color={theme.brandOn} strokeWidth={2.6} />}
              </View>
              <Body size={14} tone="secondary" style={{ flex: 1 }}>
                Compound lift (moves more than one joint)
              </Body>
            </Pressable>

            <Body size={12} tone="muted">
              Compound lifts step up by 2.5 kg when you hit all your reps, isolation work by
              1.25 kg.
            </Body>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Back"
                variant="secondary"
                onPress={() => setCreating(false)}
                style={{ flex: 1 }}
              />
              <Button label="Create and add" onPress={handleCreate} style={{ flex: 1 }} />
            </View>
          </Surface>
        </ScrollView>
      ) : (
        <FlatList
          data={results}
          keyExtractor={lift => lift.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={listPadding}
          renderItem={({ item }) => <LiftRow lift={item} onPress={() => handleSelect(item)} />}
          ListHeaderComponent={
            !filtersActive && frequentLifts.length > 0 ? (
              <View style={{ gap: spacing.sm, paddingBottom: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <History size={13} color={theme.textMuted} strokeWidth={2} />
                  <Label>Your lifts</Label>
                  <StatValue size={12} tone="muted">
                    {frequentLifts.length}
                  </StatValue>
                </View>
                {frequentLifts.map(lift => (
                  <LiftRow
                    key={`frequent-${lift.id}`}
                    lift={lift}
                    onPress={() => handleSelect(lift)}
                  />
                ))}
                <View style={{ paddingTop: spacing.sm }}>
                  <Label>All lifts</Label>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Surface style={{ padding: spacing.lg }}>
              <EmptyState
                icon={<Dumbbell size={26} color={theme.textMuted} strokeWidth={1.8} />}
                title="No lifts match that"
                message="Clear a filter, or add it yourself and it will be waiting next time."
                action={
                  <Button
                    label="Create custom lift"
                    full
                    onPress={startCreating}
                    icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
                  />
                }
              />
            </Surface>
          }
          ListFooterComponent={
            results.length > 0 ? (
              <View style={{ paddingTop: spacing.sm }}>
                <Button
                  label="Create custom lift"
                  variant="secondary"
                  full
                  onPress={startCreating}
                  icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
                />
              </View>
            ) : null
          }
        />
      )}
    </View>
  )
}

/**
 * Only ever opened from Training, so it is drawn in Training's palette. Without the scope it
 * slid up in the app's light theme over a near-black screen, which read as leaving Training.
 */
export default function LiftPickerScreen() {
  return (
    <ThemeScope theme={workoutTheme}>
      <LiftPickerBody />
    </ThemeScope>
  )
}
