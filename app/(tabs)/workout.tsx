import React, { useEffect, useMemo, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Dumbbell,
  Gauge,
  Plus,
  Repeat,
  Timer,
  Trash2,
  Trophy,
  X,
} from 'lucide-react-native'

import type {
  UserProfile,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from '@core/types'
import { formatDate, getTodayString } from '@core/utils/calculations'
import {
  epley1RM,
  exerciseVolume,
  getPersonalRecords,
  sessionSetCount,
  sessionVolume,
  suggestNextSet,
} from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { GlassSurface, Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button } from '@/components/Button'
import { EmptyState, Field, Pill, Screen } from '@/components/Layout'

// ---------------------------------------------------------------------------
// Units
//
// WorkoutSet.weightKg is ALWAYS kilograms. These two functions are the only
// boundary; nothing else in this file touches a weight without going through
// them. `toKg` deliberately does NOT use lbsToKg from calculations.ts, which
// rounds to one decimal: 225 lb would land on 102.1 kg and read back as
// "225.1 lb" — a number the user never typed. Three decimals round-trips every
// practical plate weight exactly.
// ---------------------------------------------------------------------------

type WeightUnit = UserProfile['weightUnit']

const LBS_PER_KG = 2.20462

const weightUnitLabel = (unit: WeightUnit): string => (unit === 'lbs' ? 'lbs' : 'kg')

/** kg -> the user's unit. Display boundary only — never written back to state. */
const fromKg = (kg: number, unit: WeightUnit): number =>
  unit === 'lbs' ? Math.round(kg * LBS_PER_KG * 10) / 10 : Math.round(kg * 10) / 10

/** The user's unit -> kg. Everything written to weightKg goes through here. */
const toKg = (value: number, unit: WeightUnit): number =>
  unit === 'lbs' ? Math.round((value / LBS_PER_KG) * 1000) / 1000 : Math.round(value * 10) / 10

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Thousands separators without depending on Intl being present in the JS engine. */
const groupDigits = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const pad = (value: number): string => String(value).padStart(2, '0')

/** H:MM:SS once past an hour, MM:SS before it. */
const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

/** null while the session is still open — the caller renders words, not a figure. */
const formatDuration = (session: WorkoutSession): string | null => {
  if (session.endedAt === undefined) return null
  const minutes = Math.max(0, Math.round((session.endedAt - session.startedAt) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

const defaultWorkoutName = (): string => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Morning workout'
  if (hour < 17) return 'Afternoon workout'
  return 'Evening workout'
}

const parseNumber = (text: string): number | null => {
  const cleaned = text.replace(',', '.').trim()
  if (cleaned === '') return null
  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

const weightToText = (weightKg: number, unit: WeightUnit): string =>
  weightKg > 0 ? String(fromKg(weightKg, unit)) : ''

/**
 * The set grid is a 44pt-tall row with five cells on a phone. Field's 14pt side
 * padding leaves too little room for "225.5" in a 78pt cell, so the grid uses raw
 * inputs built from the same tokens instead. Every other input on this screen is
 * a Field.
 */
const numberInputStyle = (theme: Theme, flat: boolean): TextStyle => ({
  height: HIT_SIZE,
  borderRadius: radius.control,
  borderWidth: StyleSheet.hairlineWidth * 2,
  borderColor: flat ? 'transparent' : theme.border,
  backgroundColor: flat ? 'transparent' : theme.surface,
  color: theme.text,
  paddingHorizontal: 2,
  textAlign: 'center',
  fontFamily: fonts.display,
  fontSize: 15,
  fontVariant: ['tabular-nums'],
})

const COL_SET = 44
const COL_UNIT = 22
const COL_REPS = 52
const COL_ACTION = 44
const ROW_GAP = 4

// ---------------------------------------------------------------------------
// Set row
// ---------------------------------------------------------------------------

interface SetRowProps {
  set: WorkoutSet
  /** 1-based position inside its exercise — what the user calls "set 3". */
  index: number
  unit: WeightUnit
  showRpe: boolean
  /**
   * Progressive-overload hint in kg. Rendered as PLACEHOLDER text only: an
   * untouched suggestion must never be logged as if the user performed it.
   */
  suggestion: { weightKg: number; reps: number } | null
  isPR: boolean
  onChange: (patch: Partial<WorkoutSet>) => void
  onRemove: () => void
}

const SetRow: React.FC<SetRowProps> = ({
  set,
  index,
  unit,
  showRpe,
  suggestion,
  isPR,
  onChange,
  onRemove,
}) => {
  const theme = useTheme()
  const unitLabel = weightUnitLabel(unit)

  const [weightText, setWeightText] = useState(() => weightToText(set.weightKg, unit))
  const [repsText, setRepsText] = useState(() => (set.reps > 0 ? String(set.reps) : ''))
  const [rpeText, setRpeText] = useState(() => (set.rpe === undefined ? '' : String(set.rpe)))
  const [confirmRemove, setConfirmRemove] = useState(false)

  // Re-sync only when the stored value genuinely diverges from what is typed (a
  // unit switch, or an edit made elsewhere). Comparing in kg keeps rounding from
  // fighting the user mid-keystroke. `weightText` is intentionally not a dep.
  useEffect(() => {
    const typed = parseNumber(weightText)
    const typedKg = typed === null ? 0 : toKg(typed, unit)
    if (Math.abs(typedKg - set.weightKg) > 0.05) setWeightText(weightToText(set.weightKg, unit))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.weightKg, unit])

  useEffect(() => {
    const typed = parseNumber(repsText)
    if ((typed === null ? 0 : Math.round(typed)) !== set.reps) {
      setRepsText(set.reps > 0 ? String(set.reps) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.reps])

  useEffect(() => {
    if (!confirmRemove) return
    const timer = setTimeout(() => setConfirmRemove(false), 4000)
    return () => clearTimeout(timer)
  }, [confirmRemove])

  const handleWeight = (text: string) => {
    setWeightText(text)
    const value = parseNumber(text)
    onChange({ weightKg: value === null ? 0 : toKg(value, unit) })
  }

  const handleReps = (text: string) => {
    setRepsText(text)
    const value = parseNumber(text)
    onChange({ reps: value === null ? 0 : Math.round(value) })
  }

  const handleRpe = (text: string) => {
    setRpeText(text)
    const value = parseNumber(text)
    onChange({ rpe: value === null ? undefined : Math.min(10, Math.max(1, value)) })
  }

  const handleComplete = () => {
    const next = !set.completed
    // A completed set is a real commit — the one place this row earns a haptic.
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onChange({ completed: next })
  }

  // Removing a set sits one thumb-width from completing one, so a set that
  // already holds real work asks twice. An untouched set goes on the first tap.
  const handleRemove = () => {
    if (!set.completed || confirmRemove) onRemove()
    else setConfirmRemove(true)
  }

  const settled = set.completed
  const canComplete = set.reps > 0
  const good = theme.status.good

  return (
    <View
      style={{
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: settled ? `${good}40` : 'transparent',
        backgroundColor: settled ? `${good}1A` : 'transparent',
        paddingHorizontal: 2,
        paddingVertical: 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW_GAP }}>
        {/* The set number doubles as the warmup toggle — a warmup reads 'W' and adds no volume. */}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: set.isWarmup }}
          accessibilityLabel={
            set.isWarmup
              ? `Set ${index} is a warmup set. Activate to make it a working set.`
              : `Set ${index} is a working set. Activate to make it a warmup set.`
          }
          onPress={() => onChange({ isWarmup: !set.isWarmup })}
          style={({ pressed }) => ({
            width: COL_SET,
            height: HIT_SIZE,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          <StatValue size={15} tone={set.isWarmup ? 'muted' : 'secondary'}>
            {set.isWarmup ? 'W' : index}
          </StatValue>
        </Pressable>

        <TextInput
          value={weightText}
          onChangeText={handleWeight}
          inputMode="decimal"
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholder={
            suggestion && suggestion.weightKg > 0
              ? String(fromKg(suggestion.weightKg, unit))
              : '0'
          }
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={`Set ${index} weight in ${unitLabel}`}
          style={[numberInputStyle(theme, settled), { flex: 1 }]}
        />

        <View style={{ width: COL_UNIT, alignItems: 'center' }}>
          <Body size={10} tone="muted" weight="medium">
            {unitLabel}
          </Body>
        </View>

        <TextInput
          value={repsText}
          onChangeText={handleReps}
          inputMode="numeric"
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder={suggestion ? String(suggestion.reps) : '0'}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={`Set ${index} reps`}
          style={[numberInputStyle(theme, settled), { width: COL_REPS }]}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.completed, disabled: !canComplete && !set.completed }}
          accessibilityLabel={
            set.completed
              ? `Set ${index} completed. Activate to undo.`
              : canComplete
                ? `Mark set ${index} as completed`
                : `Mark set ${index} as completed. Enter reps first.`
          }
          accessibilityHint={canComplete || set.completed ? undefined : 'Enter reps first'}
          disabled={!canComplete && !set.completed}
          onPress={handleComplete}
          style={{
            width: COL_ACTION,
            height: HIT_SIZE,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: settled ? theme.brand : theme.border,
            backgroundColor: settled ? theme.brand : 'transparent',
            opacity: !canComplete && !settled ? 0.4 : 1,
          }}
        >
          <Check size={20} color={settled ? theme.brandOn : theme.textMuted} strokeWidth={2.4} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            confirmRemove ? `Confirm removal of set ${index}` : `Remove set ${index}`
          }
          onPress={handleRemove}
          style={({ pressed }) => ({
            width: COL_ACTION,
            height: HIT_SIZE,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          <Trash2
            size={16}
            color={confirmRemove ? theme.status.critical : theme.textMuted}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      {showRpe && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: spacing.sm,
            paddingTop: 2,
            paddingBottom: 2,
            paddingRight: COL_ACTION + ROW_GAP,
          }}
        >
          <Label>RPE 1–10</Label>
          <TextInput
            value={rpeText}
            onChangeText={handleRpe}
            inputMode="decimal"
            keyboardType="decimal-pad"
            selectTextOnFocus
            placeholder="–"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={`Set ${index} rate of perceived exertion, 1 to 10`}
            style={[numberInputStyle(theme, false), { width: 64 }]}
          />
        </View>
      )}

      {confirmRemove && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 6,
            paddingBottom: 6,
            paddingTop: 4,
          }}
        >
          <AlertTriangle size={14} color={theme.status.critical} strokeWidth={2} />
          <Body size={12} weight="medium" style={{ color: theme.status.critical, flex: 1 }}>
            Tap the bin again to remove this set.
          </Body>
        </View>
      )}

      {isPR && !confirmRemove && (
        <View style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 6, paddingTop: 4 }}>
          <Pill color={good}>
            <Trophy size={12} color={good} strokeWidth={2.2} />
            <Body size={12} weight="semibold" style={{ color: good }}>
              New PR
            </Body>
            <StatValue size={12} color={good}>
              {`${fromKg(set.weightKg, unit)} ${unitLabel} × ${set.reps}`}
            </StatValue>
          </Pill>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------

interface ExerciseCardProps {
  exercise: WorkoutExercise
  unit: WeightUnit
  suggestion: { weightKg: number; reps: number } | null
  prSetIds: Set<string>
  onChangeSet: (setId: string, patch: Partial<WorkoutSet>) => void
  onRemoveSet: (setId: string) => void
  onAddSet: () => void
  onRemoveExercise: () => void
}

const ExerciseCard: React.FC<ExerciseCardProps> = ({
  exercise,
  unit,
  suggestion,
  prSetIds,
  onChangeSet,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
}) => {
  const theme = useTheme()
  const [showRpe, setShowRpe] = useState(false)

  const unitLabel = weightUnitLabel(unit)
  const sets = exercise.sets ?? []
  const liftVolume = exerciseVolume(exercise)

  /**
   * A hint only: the previous set of this exercise, else the progressive-overload
   * target. It is rendered as placeholder text and is never written to state.
   */
  const placeholderFor = (
    position: number
  ): { weightKg: number; reps: number } | null => {
    for (let i = position - 1; i >= 0; i--) {
      const previous = sets[i]
      if (previous.reps > 0) return { weightKg: previous.weightKg, reps: previous.reps }
    }
    return suggestion
  }

  return (
    <Surface style={{ padding: spacing.md, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight="semibold" numberOfLines={1}>
            {exercise.lift.name}
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Body size={12} tone="muted" numberOfLines={1}>
              {`${exercise.lift.muscleGroup} · ${exercise.lift.equipment}`}
            </Body>
            {liftVolume > 0 && (
              <>
                <Body size={12} tone="muted">
                  ·
                </Body>
                <StatValue size={12} tone="secondary">
                  {groupDigits(fromKg(liftVolume, unit))}
                </StatValue>
                <Body size={12} tone="muted">
                  {unitLabel}
                </Body>
              </>
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: showRpe }}
          accessibilityLabel={`${showRpe ? 'Hide' : 'Show'} RPE for ${exercise.lift.name}`}
          onPress={() => setShowRpe(value => !value)}
          style={({ pressed }) => ({
            width: HIT_SIZE,
            height: HIT_SIZE,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          <Gauge size={18} color={showRpe ? theme.brandText : theme.textMuted} strokeWidth={2} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${exercise.lift.name} from this workout`}
          onPress={onRemoveExercise}
          style={({ pressed }) => ({
            width: HIT_SIZE,
            height: HIT_SIZE,
            borderRadius: radius.control,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          <X size={18} color={theme.textMuted} strokeWidth={2} />
        </Pressable>
      </View>

      {/* The target is a suggestion, never a logged value. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {suggestion === null ? (
          <Body size={12} tone="muted">
            First time logging this lift — record what you actually do.
          </Body>
        ) : (
          <>
            <Body size={12} tone="muted">
              Target from last time
            </Body>
            <StatValue size={13} tone="secondary">
              {suggestion.weightKg > 0
                ? `${fromKg(suggestion.weightKg, unit)} ${unitLabel} × ${suggestion.reps}`
                : `Bodyweight × ${suggestion.reps}`}
            </StatValue>
          </>
        )}
      </View>

      {sets.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: ROW_GAP,
            paddingHorizontal: 2,
          }}
        >
          <View style={{ width: COL_SET, alignItems: 'center' }}>
            <Label>Set</Label>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Label>Weight</Label>
          </View>
          <View style={{ width: COL_UNIT }} />
          <View style={{ width: COL_REPS, alignItems: 'center' }}>
            <Label>Reps</Label>
          </View>
          <View style={{ width: COL_ACTION, alignItems: 'center' }}>
            <Label>Done</Label>
          </View>
          <View style={{ width: COL_ACTION }} />
        </View>
      )}

      <View style={{ gap: 2 }}>
        {sets.map((set, position) => (
          <SetRow
            key={set.id}
            set={set}
            index={position + 1}
            unit={unit}
            showRpe={showRpe}
            suggestion={placeholderFor(position)}
            isPR={prSetIds.has(set.id)}
            onChange={patch => onChangeSet(set.id, patch)}
            onRemove={() => onRemoveSet(set.id)}
          />
        ))}
      </View>

      <Button
        label="Add set"
        variant="secondary"
        full
        onPress={onAddSet}
        icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
      />
    </Surface>
  )
}

// ---------------------------------------------------------------------------
// Active session
// ---------------------------------------------------------------------------

/**
 * Owns the one-second tick on its own so the re-render stays here. Hoisting the
 * clock into the session card would re-render every weight and rep input once a
 * second while the user is typing into them.
 */
const ElapsedTimer: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return <StatValue size={20}>{formatElapsed(Math.max(0, now - startedAt))}</StatValue>
}

const ActiveWorkout: React.FC<{ session: WorkoutSession; unit: WeightUnit }> = ({
  session,
  unit,
}) => {
  const theme = useTheme()
  const workoutLog = useStore(s => s.workoutLog)
  const addSet = useStore(s => s.addSet)
  const updateSet = useStore(s => s.updateSet)
  const removeSet = useStore(s => s.removeSet)
  const removeExerciseFromWorkout = useStore(s => s.removeExerciseFromWorkout)
  const endWorkout = useStore(s => s.endWorkout)
  const cancelWorkout = useStore(s => s.cancelWorkout)

  const [name, setName] = useState(session.name)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    setName(session.name)
  }, [session.id, session.name])

  // There is no rename action in the shared store contract and the header name
  // has to be editable, so this writes the one field through zustand's own
  // setState — exactly what the web app does.
  const renameWorkout = (value: string) => {
    setName(value)
    useStore.setState({
      workoutLog: useStore
        .getState()
        .workoutLog.map(entry => (entry.id === session.id ? { ...entry, name: value } : entry)),
    })
  }

  const exercises = session.exercises ?? []
  const unitLabel = weightUnitLabel(unit)
  const volumeKg = sessionVolume(session)
  const setCount = sessionSetCount(session)
  const hasCompletedSets = exercises.some(ex => (ex.sets ?? []).some(set => set.completed))

  // Records from every OTHER session — comparing against a log that already
  // contains this session would mean every set ties its own record.
  const priorRecords = useMemo(() => {
    const map = new Map<string, number>()
    for (const record of getPersonalRecords(workoutLog.filter(entry => entry.id !== session.id))) {
      map.set(record.liftId, record.bestEstimated1RM)
    }
    return map
  }, [workoutLog, session.id])

  // Only the single best qualifying set per exercise wears the badge.
  const prSetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const exercise of exercises) {
      const best1RM = priorRecords.get(exercise.liftId)
      if (best1RM === undefined) continue
      let winner: { id: string; oneRM: number } | null = null
      for (const set of exercise.sets ?? []) {
        if (!set.completed || set.isWarmup || set.weightKg <= 0 || set.reps <= 0) continue
        const oneRM = epley1RM(set.weightKg, set.reps)
        if (oneRM > best1RM && (winner === null || oneRM > winner.oneRM)) {
          winner = { id: set.id, oneRM }
        }
      }
      if (winner) ids.add(winner.id)
    }
    return ids
  }, [exercises, priorRecords])

  const suggestions = useMemo(() => {
    const map = new Map<string, { weightKg: number; reps: number } | null>()
    for (const exercise of exercises) {
      if (!map.has(exercise.liftId)) {
        map.set(exercise.liftId, suggestNextSet(workoutLog, exercise.liftId, exercise.lift))
      }
    }
    return map
  }, [exercises, workoutLog])

  const openPicker = () => {
    router.push({ pathname: '/lift-picker', params: { sessionId: session.id } })
  }

  return (
    <>
      {/* The live session floats above the rest of the screen — the one glass card here. */}
      <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <TextInput
            value={name}
            onChangeText={renameWorkout}
            placeholder="Workout name"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Workout name"
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: HIT_SIZE,
              borderRadius: radius.control,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: theme.glass.border,
              paddingHorizontal: 12,
              fontFamily: fonts.displayBold,
              fontSize: 20,
              color: theme.text,
            }}
          />
          <Pill color={theme.status.good}>
            <Activity size={12} color={theme.status.good} strokeWidth={2.4} />
            <Body size={12} weight="semibold" style={{ color: theme.status.good }}>
              Live
            </Body>
          </Pill>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <StatValue size={40}>{groupDigits(fromKg(volumeKg, unit))}</StatValue>
            <Label>{`${unitLabel} volume`}</Label>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <StatValue size={20}>{setCount}</StatValue>
            <Label>Sets</Label>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Timer size={14} color={theme.textMuted} strokeWidth={2} />
              <ElapsedTimer startedAt={session.startedAt} />
            </View>
            <Label>Elapsed</Label>
          </View>
        </View>

        <Button label="Finish workout" full haptic onPress={endWorkout} />
      </GlassSurface>

      {exercises.length === 0 ? (
        <Surface style={{ padding: spacing.lg }}>
          <EmptyState
            icon={<Dumbbell size={26} color={theme.textMuted} strokeWidth={1.8} />}
            title="Nothing logged yet"
            message="Add the first lift of the session. Every set is weight × reps, ticked off as you finish it."
            action={
              <Button
                label="Add exercise"
                full
                onPress={openPicker}
                icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
              />
            }
          />
        </Surface>
      ) : (
        exercises.map(exercise => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            unit={unit}
            suggestion={suggestions.get(exercise.liftId) ?? null}
            prSetIds={prSetIds}
            onChangeSet={(setId, patch) => updateSet(session.id, exercise.id, setId, patch)}
            onRemoveSet={setId => removeSet(session.id, exercise.id, setId)}
            onAddSet={() =>
              addSet(session.id, exercise.id, {
                weightKg: 0,
                reps: 0,
                isWarmup: false,
                completed: false,
              })
            }
            onRemoveExercise={() => removeExerciseFromWorkout(session.id, exercise.id)}
          />
        ))
      )}

      {exercises.length > 0 && (
        <Button
          label="Add exercise"
          variant="secondary"
          full
          onPress={openPicker}
          icon={<Plus size={16} color={theme.text} strokeWidth={2.2} />}
        />
      )}

      {/* Cancel sits at the far end of the screen, well away from Finish, and asks twice. */}
      {confirmCancel ? (
        <Surface style={{ padding: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <AlertTriangle size={16} color={theme.status.critical} strokeWidth={2} />
            <Body size={13} tone="secondary" style={{ flex: 1 }}>
              {hasCompletedSets
                ? 'Ending here keeps the sets you already ticked off and closes the session.'
                : 'Nothing is ticked off yet, so this workout will be deleted.'}
            </Body>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Keep training"
              variant="secondary"
              onPress={() => setConfirmCancel(false)}
              style={{ flex: 1 }}
            />
            <Button
              label={hasCompletedSets ? 'End now' : 'Delete workout'}
              variant="ghost"
              onPress={() => {
                cancelWorkout()
                setConfirmCancel(false)
              }}
              icon={<Trash2 size={16} color={theme.status.critical} strokeWidth={2} />}
              style={{ flex: 1 }}
            />
          </View>
        </Surface>
      ) : (
        <Button
          label="Cancel workout"
          variant="ghost"
          full
          onPress={() => setConfirmCancel(true)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

interface SetGroup {
  count: number
  reps: number
  weightKg: number
}

/** Consecutive identical working sets collapse into '3 × 8 @ 100' the way a log reads. */
const groupSets = (exercise: WorkoutExercise): SetGroup[] => {
  const groups: SetGroup[] = []
  for (const set of exercise.sets ?? []) {
    if (!set.completed || set.isWarmup) continue
    const last = groups[groups.length - 1]
    if (last && last.reps === set.reps && last.weightKg === set.weightKg) last.count += 1
    else groups.push({ count: 1, reps: set.reps, weightKg: set.weightKg })
  }
  return groups
}

const HistoryCard: React.FC<{ session: WorkoutSession; unit: WeightUnit }> = ({
  session,
  unit,
}) => {
  const theme = useTheme()
  const saveWorkoutTemplate = useStore(s => s.saveWorkoutTemplate)
  const deleteWorkout = useStore(s => s.deleteWorkout)

  const [expanded, setExpanded] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const unitLabel = weightUnitLabel(unit)
  const exercises = session.exercises ?? []
  const setCount = sessionSetCount(session)
  const duration = formatDuration(session)

  return (
    <Surface>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${session.name}, ${formatDate(session.date)}`}
        accessibilityHint={expanded ? 'Hide session detail' : 'Show session detail'}
        onPress={() => setExpanded(value => !value)}
        style={{
          minHeight: HIT_SIZE,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight="semibold" numberOfLines={1}>
            {session.name}
          </Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Body size={12} tone="muted">
              {formatDate(session.date)}
            </Body>
            <Body size={12} tone="muted">
              ·
            </Body>
            <StatValue size={12} tone="muted">
              {setCount}
            </StatValue>
            <Body size={12} tone="muted">
              {setCount === 1 ? 'set' : 'sets'}
            </Body>
            <Body size={12} tone="muted">
              ·
            </Body>
            {duration === null ? (
              <Body size={12} tone="muted">
                In progress
              </Body>
            ) : (
              <StatValue size={12} tone="muted">
                {duration}
              </StatValue>
            )}
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <StatValue size={18}>{groupDigits(fromKg(sessionVolume(session), unit))}</StatValue>
          <Label>{`${unitLabel} volume`}</Label>
        </View>

        <ChevronDown
          size={18}
          color={theme.textMuted}
          strokeWidth={2}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {expanded && (
        <View
          style={{
            gap: spacing.md,
            padding: spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: theme.border,
          }}
        >
          {exercises.length === 0 ? (
            <Body size={13} tone="muted">
              No exercises were logged in this session.
            </Body>
          ) : (
            exercises.map(exercise => {
              const groups = groupSets(exercise)
              return (
                <View key={exercise.id} style={{ gap: 2 }}>
                  <Body size={13} weight="medium">
                    {exercise.lift.name}
                  </Body>
                  {groups.length === 0 ? (
                    <Body size={12} tone="muted">
                      No completed sets
                    </Body>
                  ) : (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        flexWrap: 'wrap',
                      }}
                    >
                      {groups.map((group, index) => (
                        <React.Fragment key={index}>
                          {index > 0 && (
                            <Body size={12} tone="muted">
                              ·
                            </Body>
                          )}
                          <StatValue size={12} tone="secondary">
                            {group.weightKg > 0
                              ? `${group.count} × ${group.reps} @ ${fromKg(group.weightKg, unit)} ${unitLabel}`
                              : `${group.count} × ${group.reps}`}
                          </StatValue>
                        </React.Fragment>
                      ))}
                    </View>
                  )}
                </View>
              )
            })
          )}

          {namingTemplate ? (
            <View style={{ gap: spacing.sm }}>
              <Field
                label="Template name"
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="e.g. Push day"
                accessibilityLabel="Template name"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={() => setNamingTemplate(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Save template"
                  disabled={templateName.trim() === ''}
                  onPress={() => {
                    const trimmed = templateName.trim()
                    if (trimmed === '') return
                    saveWorkoutTemplate(trimmed, session.id)
                    setNamingTemplate(false)
                    setTemplateName('')
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : confirmDelete ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <AlertTriangle size={16} color={theme.status.critical} strokeWidth={2} />
                <Body size={13} tone="secondary" style={{ flex: 1 }}>
                  This deletes the session and every set in it. It cannot be undone.
                </Body>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button
                  label="Keep it"
                  variant="secondary"
                  onPress={() => setConfirmDelete(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Delete for good"
                  variant="ghost"
                  onPress={() => deleteWorkout(session.id)}
                  icon={<Trash2 size={16} color={theme.status.critical} strokeWidth={2} />}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Save as template"
                variant="secondary"
                disabled={exercises.length === 0}
                onPress={() => {
                  setTemplateName(session.name)
                  setNamingTemplate(true)
                }}
                icon={<Repeat size={16} color={theme.text} strokeWidth={2} />}
                style={{ flex: 1 }}
              />
              <Button
                label="Delete"
                variant="ghost"
                onPress={() => setConfirmDelete(true)}
                icon={<Trash2 size={16} color={theme.textMuted} strokeWidth={2} />}
              />
            </View>
          )}
        </View>
      )}
    </Surface>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const PR_PREVIEW_COUNT = 5

export default function WorkoutScreen() {
  const theme = useTheme()
  const workoutLog = useStore(s => s.workoutLog)
  const activeWorkoutId = useStore(s => s.activeWorkoutId)
  const workoutTemplates = useStore(s => s.workoutTemplates)
  const unit = useStore(s => s.profile.weightUnit)
  const startWorkout = useStore(s => s.startWorkout)
  const applyWorkoutTemplate = useStore(s => s.applyWorkoutTemplate)

  const [showAllRecords, setShowAllRecords] = useState(false)

  const unitLabel = weightUnitLabel(unit)
  const activeSession = workoutLog.find(session => session.id === activeWorkoutId) ?? null
  const history = useMemo(
    () => workoutLog.filter(session => session.id !== activeWorkoutId),
    [workoutLog, activeWorkoutId]
  )
  const records = useMemo(() => getPersonalRecords(workoutLog), [workoutLog])
  const visibleRecords = showAllRecords ? records : records.slice(0, PR_PREVIEW_COUNT)

  const neverTrained = activeSession === null && workoutLog.length === 0

  const handleStart = () => {
    startWorkout(defaultWorkoutName(), getTodayString())
  }

  return (
    <Screen title="Workout" subtitle={activeSession ? 'Session in progress' : undefined}>
      {activeSession && <ActiveWorkout session={activeSession} unit={unit} />}

      {neverTrained && (
        <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
          <EmptyState
            icon={<Dumbbell size={26} color={theme.brandText} strokeWidth={1.8} />}
            title="Track your first workout"
            message="Start a session, add the lifts you are doing, then log each set as weight × reps and tick it off. Your volume, set count and personal records are worked out from there — and next time you get a target to beat."
            action={
              <Button
                label="Start your first workout"
                full
                onPress={handleStart}
                icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
              />
            }
          />
          <Body size={12} tone="muted" style={{ textAlign: 'center' }}>
            {`Weights are logged in ${unitLabel}. Change the unit any time in Profile.`}
          </Body>
        </Surface>
      )}

      {activeSession === null && !neverTrained && (
        <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <SectionTitle>Ready to train?</SectionTitle>
            <Body size={13} tone="secondary">
              Pick up where you left off — every lift remembers what you did last time.
            </Body>
          </View>
          <Button
            label="Start workout"
            full
            onPress={handleStart}
            icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
          />
        </Surface>
      )}

      {activeSession === null && workoutTemplates.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>Quick start</SectionTitle>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}
          >
            {workoutTemplates.map(template => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                accessibilityLabel={`Start ${template.name}, ${template.liftIds.length} lifts`}
                onPress={() => applyWorkoutTemplate(template.id, getTodayString())}
              >
                <Surface
                  radius={radius.control}
                  style={{
                    minHeight: HIT_SIZE,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    paddingHorizontal: spacing.lg,
                  }}
                >
                  <Repeat size={16} color={theme.brandText} strokeWidth={2} />
                  <Body weight="semibold">{template.name}</Body>
                  <StatValue size={13} tone="muted">
                    {template.liftIds.length}
                  </StatValue>
                </Surface>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {records.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Trophy size={18} color={theme.brandText} strokeWidth={2} />
            <SectionTitle>Personal records</SectionTitle>
          </View>
          <Surface>
            {visibleRecords.map((record, index) => (
              <View
                key={record.liftId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: spacing.md,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth * 2,
                  borderTopColor: theme.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body weight="medium" numberOfLines={1}>
                    {record.liftName}
                  </Body>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}
                  >
                    <Body size={12} tone="muted">
                      Best set
                    </Body>
                    <StatValue size={12} tone="secondary">
                      {`${fromKg(record.bestWeightKg, unit)} ${unitLabel}`}
                    </StatValue>
                    {record.achievedOn !== '' && (
                      <>
                        <Body size={12} tone="muted">
                          ·
                        </Body>
                        <Body size={12} tone="muted">
                          {formatDate(record.achievedOn)}
                        </Body>
                      </>
                    )}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <StatValue size={18}>{fromKg(record.bestEstimated1RM, unit)}</StatValue>
                  <Label>{`est. 1RM ${unitLabel}`}</Label>
                </View>
              </View>
            ))}
          </Surface>
          {records.length > PR_PREVIEW_COUNT && (
            <Button
              label={
                showAllRecords ? 'Show top records only' : `Show all ${records.length} records`
              }
              variant="ghost"
              full
              onPress={() => setShowAllRecords(value => !value)}
            />
          )}
        </View>
      )}

      {history.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle>History</SectionTitle>
          {history.map(session => (
            <HistoryCard key={session.id} session={session} unit={unit} />
          ))}
        </View>
      )}
    </Screen>
  )
}
