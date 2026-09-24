import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, TextInput, View, type TextStyle } from 'react-native'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { Check, Dumbbell, Flame, Gauge, MoreHorizontal, Plus, Trash2, Trophy } from 'lucide-react-native'

import type { WorkoutExercise, WorkoutSession, WorkoutSet } from '@core/types'
import {
  epley1RM,
  getPersonalRecords,
  sessionSetCount,
  sessionVolume,
  suggestNextSet,
} from '@core/utils/workoutMath'

import { useStore } from '@/store/useStore'
import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { ActionSheet } from '@/components/ActionSheet'
import { EmptyState, Pill } from '@/components/Layout'
import { useRestClock } from './restClock'
import {
  formatElapsed,
  fromKg,
  groupDigits,
  parseNumber,
  toKg,
  weightToText,
  weightUnitLabel,
  type WeightUnit,
} from './format'

/**
 * The set grid's inputs. Filled, borderless and centred, the way Hevy's are: a bordered box per
 * cell turned five columns into a spreadsheet of outlines, and the numbers are what the eye
 * should land on, not the frames around them. Raw inputs rather than Field because Field's 14pt
 * side padding leaves too little room for "102.5" in a phone-width column.
 */
const numberInputStyle = (theme: Theme, flat: boolean): TextStyle => ({
  height: HIT_SIZE,
  borderRadius: radius.tight,
  // surfaceRaised, not surface: the exercise card is already `surface`, so an input filled with
  // the same value disappears into it. A completed row drops the fill so the tint shows through.
  backgroundColor: flat ? 'transparent' : theme.surfaceRaised,
  color: theme.text,
  paddingHorizontal: 2,
  paddingVertical: 0,
  textAlign: 'center',
  fontFamily: fonts.display,
  fontSize: 16,
  // No tabular-nums: Android's TextInput re-measures on every keystroke with it set on the
  // display face, and the field jumps and drops the cursor mid-edit. See Field in Layout.tsx.
})

/*
  Column geometry, shared by the header and every row. Change one and both move together.

  No unit column and no bin column any more. The unit is in the header ("KG"), where it is
  said once instead of once per set, and removing a set lives behind the set number with
  the warm-up toggle — the two things you do to a set rather than in it. That returned two
  fixed columns' worth of width to PREVIOUS, which is the column Hevy proved people read most.
*/
const COL_SET = 36
const COL_CHECK = 44
const ROW_GAP = 6
const FLEX_PREVIOUS = 1.3
const FLEX_WEIGHT = 1
const FLEX_REPS = 0.85
const ROW_PADDING = 4

type SetValues = { weightKg: number; reps: number }

const formatSetValues = (values: SetValues, unit: WeightUnit): string =>
  values.weightKg > 0 ? `${fromKg(values.weightKg, unit)} × ${values.reps}` : `${values.reps} reps`

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
   * What this set will be logged as if the user just ticks it: the previous set of this
   * exercise, else the progressive-overload target. In kg.
   *
   * Shown as placeholder text, and it still never reaches state on its own — but ticking
   * the row commits it verbatim. Mid-set, the user is holding a dumbbell and reading a number
   * the app already knows; making them type it back in first is friction with nothing behind it.
   */
  suggestion: SetValues | null
  /** The same set number from the last session with this lift, for the PREVIOUS column. */
  previous: SetValues | null
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
  previous,
  isPR,
  onChange,
  onRemove,
}) => {
  const theme = useTheme()
  const unitLabel = weightUnitLabel(unit)

  const [weightText, setWeightText] = useState(() => weightToText(set.weightKg, unit))
  const [repsText, setRepsText] = useState(() => (set.reps > 0 ? String(set.reps) : ''))
  const [rpeText, setRpeText] = useState(() => (set.rpe === undefined ? '' : String(set.rpe)))
  const [menuOpen, setMenuOpen] = useState(false)
  const repsRef = useRef<TextInput>(null)

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

  /** Tapping PREVIOUS copies it into the row, the shortcut Hevy users reach for by habit. */
  const usePrevious = () => {
    if (previous === null || set.completed) return
    void Haptics.selectionAsync()
    setWeightText(weightToText(previous.weightKg, unit))
    setRepsText(String(previous.reps))
    onChange({ weightKg: previous.weightKg, reps: previous.reps })
  }

  /**
   * Ticking a row that was left empty logs the prefill rather than logging a zero.
   *
   * Only fields the user has not filled in are taken from the prefill: someone who dialled
   * the weight up to 22.5 and then ticked without touching reps meant 22.5, not last set's
   * weight. The local input text is updated alongside state so the row reads back what was
   * actually committed instead of continuing to show a hint.
   */
  const handleComplete = () => {
    const next = !set.completed
    // A completed set is a real commit — the one place this row earns a haptic.
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    if (next && set.reps <= 0 && suggestion !== null && suggestion.reps > 0) {
      const typedWeight = parseNumber(weightText)
      const weightKg = typedWeight === null ? suggestion.weightKg : toKg(typedWeight, unit)
      setWeightText(weightToText(weightKg, unit))
      setRepsText(String(suggestion.reps))
      onChange({ weightKg, reps: suggestion.reps, completed: true })
      return
    }

    onChange({ completed: next })
  }

  const settled = set.completed
  // Enabled as soon as there is something to log, typed or prefilled.
  const canComplete = set.reps > 0 || (suggestion !== null && suggestion.reps > 0)
  const good = theme.status.good

  /*
    Prefill text is `textSecondary`, not `textMuted`. It has to be readable at arm's length
    between sets and is about to become the logged value on one tap. It stays a step lighter
    than entered text so the row still says which numbers the user chose.
  */
  const prefillWeight =
    suggestion && suggestion.weightKg > 0 ? String(fromKg(suggestion.weightKg, unit)) : null
  const prefillReps = suggestion && suggestion.reps > 0 ? String(suggestion.reps) : null

  return (
    <View
      style={{
        paddingHorizontal: ROW_PADDING,
        paddingVertical: 2,
        borderRadius: radius.tight,
        backgroundColor: settled ? `${good}1F` : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minHeight: HIT_SIZE }}>
        {/* The set number opens what you can do TO a set: warm-up or working, or remove it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${index}${set.isWarmup ? ', warm-up' : ''}. Set options`}
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => ({
            width: COL_SET,
            height: HIT_SIZE,
            borderRadius: radius.tight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? theme.border : 'transparent',
          })}
        >
          {set.isWarmup ? (
            <StatValue size={15} color={theme.status.warning}>
              W
            </StatValue>
          ) : (
            <StatValue size={15} tone={settled ? 'primary' : 'secondary'}>
              {index}
            </StatValue>
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            previous
              ? `Last time ${formatSetValues(previous, unit)}. Activate to copy it into set ${index}`
              : `No previous set ${index}`
          }
          disabled={previous === null || settled}
          onPress={usePrevious}
          style={{ flex: FLEX_PREVIOUS, height: HIT_SIZE, justifyContent: 'center', alignItems: 'center' }}
        >
          <StatValue size={13} tone="muted" numberOfLines={1}>
            {previous ? formatSetValues(previous, unit) : '—'}
          </StatValue>
        </Pressable>

        <TextInput
          value={weightText}
          onChangeText={handleWeight}
          inputMode="decimal"
          keyboardType="decimal-pad"
          selectTextOnFocus
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => repsRef.current?.focus()}
          placeholder={prefillWeight ?? '0'}
          placeholderTextColor={prefillWeight ? theme.textSecondary : theme.textMuted}
          accessibilityLabel={`Set ${index} weight in ${unitLabel}`}
          style={[numberInputStyle(theme, settled), { flex: FLEX_WEIGHT }]}
        />

        <TextInput
          ref={repsRef}
          value={repsText}
          onChangeText={handleReps}
          inputMode="numeric"
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder={prefillReps ?? '0'}
          placeholderTextColor={prefillReps ? theme.textSecondary : theme.textMuted}
          accessibilityLabel={`Set ${index} reps`}
          style={[numberInputStyle(theme, settled), { flex: FLEX_REPS }]}
        />

        <Pressable
          needsOffscreenAlphaCompositing
          accessibilityRole="checkbox"
          accessibilityState={{ checked: set.completed, disabled: !canComplete && !set.completed }}
          accessibilityLabel={
            set.completed
              ? `Set ${index} completed. Activate to undo.`
              : set.reps > 0
                ? `Mark set ${index} as completed`
                : prefillReps
                  ? `Log set ${index} as ${prefillWeight ? `${prefillWeight} ${unitLabel} ` : ''}${prefillReps} reps`
                  : `Mark set ${index} as completed. Enter reps first.`
          }
          disabled={!canComplete && !set.completed}
          onPress={handleComplete}
          style={{
            width: COL_CHECK,
            height: HIT_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !canComplete && !settled ? 0.35 : 1,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.tight,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: settled ? theme.brand : theme.surfaceRaised,
            }}
          >
            <Check size={20} color={settled ? theme.brandOn : theme.textSecondary} strokeWidth={2.6} />
          </View>
        </Pressable>
      </View>

      {showRpe && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: spacing.sm,
            paddingVertical: 2,
            paddingRight: COL_CHECK + ROW_GAP,
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

      {isPR && (
        <View style={{ flexDirection: 'row', paddingLeft: COL_SET + ROW_GAP, paddingBottom: 6, paddingTop: 2 }}>
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

      {/* The sheet is the confirmation. Removing used to be a bin one thumb-width from the tick,
          guarded by a second tap and a red warning line; behind the set number it cannot be
          hit by accident, so it no longer needs to ask twice. */}
      <ActionSheet
        visible={menuOpen}
        title={`Set ${index}`}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            label: set.isWarmup ? 'Make it a working set' : 'Mark as warm-up',
            icon: <Flame size={20} color={theme.status.warning} strokeWidth={2} />,
            onPress: () => onChange({ isWarmup: !set.isWarmup }),
          },
          {
            label: 'Remove set',
            icon: <Trash2 size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: onRemove,
          },
        ]}
      />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Exercise card
// ---------------------------------------------------------------------------

interface ExerciseCardProps {
  exercise: WorkoutExercise
  unit: WeightUnit
  suggestion: SetValues | null
  /** Completed sets from the last session with this lift, in order. */
  previousSets: SetValues[]
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
  previousSets,
  prSetIds,
  onChangeSet,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
}) => {
  const theme = useTheme()
  const [showRpe, setShowRpe] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const unitLabel = weightUnitLabel(unit)
  const sets = exercise.sets ?? []

  /**
   * What the next set will be logged as on a single tick: the previous set of this
   * exercise, else the progressive-overload target. Shown as placeholder text, and written
   * to state only when the user actually ticks the row.
   */
  const placeholderFor = (position: number): SetValues | null => {
    for (let i = position - 1; i >= 0; i--) {
      const earlier = sets[i]
      if (earlier.reps > 0) return { weightKg: earlier.weightKg, reps: earlier.reps }
    }
    return suggestion
  }

  return (
    <Surface style={{ padding: spacing.md, gap: spacing.sm }}>
      {/* The lift's name is the accent, as in Hevy: in a long session it is what the eye scans
          for, and the only other lime on the card is a ticked set. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: ROW_PADDING }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={16} weight="semibold" numberOfLines={1} style={{ color: theme.brandText }}>
            {exercise.lift.name}
          </Body>
          <Body size={12} tone="muted" numberOfLines={1}>
            {`${exercise.lift.muscleGroup} · ${exercise.lift.equipment}`}
          </Body>
        </View>
        <IconButton
          accessibilityLabel={`Options for ${exercise.lift.name}`}
          onPress={() => setMenuOpen(true)}
          style={{ marginRight: -spacing.sm }}
        >
          <MoreHorizontal size={20} color={theme.textSecondary} strokeWidth={2} />
        </IconButton>
      </View>

      {sets.length > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: ROW_GAP,
            paddingHorizontal: ROW_PADDING,
          }}
        >
          <View style={{ width: COL_SET, alignItems: 'center' }}>
            <Label>Set</Label>
          </View>
          <View style={{ flex: FLEX_PREVIOUS, alignItems: 'center' }}>
            <Label>Previous</Label>
          </View>
          <View style={{ flex: FLEX_WEIGHT, alignItems: 'center' }}>
            <Label>{unitLabel}</Label>
          </View>
          <View style={{ flex: FLEX_REPS, alignItems: 'center' }}>
            <Label>Reps</Label>
          </View>
          <View style={{ width: COL_CHECK, alignItems: 'center' }}>
            <Check size={14} color={theme.textMuted} strokeWidth={2.6} />
          </View>
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
            previous={previousSets[position] ?? null}
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

      <ActionSheet
        visible={menuOpen}
        title={exercise.lift.name}
        onClose={() => setMenuOpen(false)}
        options={[
          {
            label: showRpe ? 'Hide RPE' : 'Log RPE',
            icon: <Gauge size={20} color={theme.brandText} strokeWidth={2} />,
            onPress: () => setShowRpe(value => !value),
          },
          {
            label: 'Remove exercise',
            icon: <Trash2 size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: onRemoveExercise,
          },
        ]}
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
  const theme = useTheme()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <StatValue size={18} color={theme.brandText}>
      {formatElapsed(Math.max(0, now - startedAt))}
    </StatValue>
  )
}

const SessionStat: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
    <Label>{label}</Label>
    {children}
  </View>
)

/** Completed sets from the most recent other session that included each lift. */
const lastSessionSets = (
  workoutLog: WorkoutSession[],
  currentId: string
): Map<string, SetValues[]> => {
  const byLift = new Map<string, SetValues[]>()
  const sessions = workoutLog
    .filter(entry => entry.id !== currentId)
    .sort((a, b) => b.startedAt - a.startedAt)
  for (const session of sessions) {
    for (const exercise of session.exercises ?? []) {
      if (byLift.has(exercise.liftId)) continue
      const done = (exercise.sets ?? [])
        .filter(set => set.completed && set.reps > 0)
        .map(set => ({ weightKg: set.weightKg, reps: set.reps }))
      if (done.length > 0) byLift.set(exercise.liftId, done)
    }
  }
  return byLift
}

export const ActiveWorkout: React.FC<{
  session: WorkoutSession
  unit: WeightUnit
  /** The screen's Finish — ends the session and shows the summary. */
  onFinish: () => void
}> = ({ session, unit, onFinish }) => {
  const theme = useTheme()
  const workoutLog = useStore(s => s.workoutLog)
  const addSet = useStore(s => s.addSet)
  const updateSet = useStore(s => s.updateSet)
  const removeSet = useStore(s => s.removeSet)
  const removeExerciseFromWorkout = useStore(s => s.removeExerciseFromWorkout)
  const cancelWorkout = useStore(s => s.cancelWorkout)
  const deleteWorkout = useStore(s => s.deleteWorkout)

  // Bumped whenever a working set is ticked off; that is what (re)starts the rest clock.
  const startRest = useRestClock(state => state.start)
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
    const map = new Map<string, SetValues | null>()
    for (const exercise of exercises) {
      if (!map.has(exercise.liftId)) {
        map.set(exercise.liftId, suggestNextSet(workoutLog, exercise.liftId, exercise.lift))
      }
    }
    return map
  }, [exercises, workoutLog])

  const previousByLift = useMemo(
    () => lastSessionSets(workoutLog, session.id),
    [workoutLog, session.id]
  )

  const openPicker = () => {
    router.push({ pathname: '/lift-picker', params: { sessionId: session.id } })
  }

  return (
    <>
      {/* Name and the three running figures, the way Hevy heads a live workout. Finish is in
          the screen header, so this card no longer carries a button the width of the screen
          or a 40pt volume figure nobody reads mid-set. */}
      <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
        <TextInput
          value={name}
          onChangeText={renameWorkout}
          placeholder="Workout name"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel="Workout name"
          style={{
            minHeight: HIT_SIZE,
            paddingHorizontal: 0,
            paddingVertical: 0,
            fontFamily: fonts.displayBold,
            fontSize: 22,
            color: theme.text,
          }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <SessionStat label="Duration">
            <ElapsedTimer startedAt={session.startedAt} />
          </SessionStat>
          <SessionStat label="Volume">
            <StatValue size={18} numberOfLines={1}>
              {`${groupDigits(fromKg(volumeKg, unit))} ${unitLabel}`}
            </StatValue>
          </SessionStat>
          <SessionStat label="Sets">
            <StatValue size={18}>{setCount}</StatValue>
          </SessionStat>
        </View>
      </Surface>


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
            previousSets={previousByLift.get(exercise.liftId) ?? []}
            prSetIds={prSetIds}
            onChangeSet={(setId, patch) => {
              updateSet(session.id, exercise.id, setId, patch)
              // Only a completed WORKING set starts a rest period — warmups, and edits to
              // weight or reps, must not reset the clock mid-set.
              const target = exercise.sets.find(entry => entry.id === setId)
              if (patch.completed === true && target && !target.isWarmup) {
                startRest()
              }
            }}
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
          full
          onPress={openPicker}
          icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.2} />}
        />
      )}

      {/* At the far end of the screen, well away from Finish, and it asks first. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setConfirmCancel(true)}
        style={({ pressed }) => ({
          minHeight: HIT_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.control,
          backgroundColor: pressed ? theme.border : 'transparent',
        })}
      >
        <Body weight="semibold" style={{ color: theme.status.critical }}>
          Discard workout
        </Body>
      </Pressable>

      <ActionSheet
        visible={confirmCancel}
        title="Discard this workout?"
        message={
          hasCompletedSets
            ? 'You have ticked sets. Finish keeps them and shows your summary; delete throws the whole session away.'
            : 'Nothing is ticked off yet, so there is nothing to keep.'
        }
        onClose={() => setConfirmCancel(false)}
        /*
          "End now" used to sit here in red, and kept the sets: that is Finish, minus the
          summary, dressed as a destructive action. Keeping work is always Finish now, and
          the red row only ever means gone.
        */
        options={[
          ...(hasCompletedSets
            ? [
                {
                  label: 'Finish and keep my sets',
                  icon: <Check size={20} color={theme.brandText} strokeWidth={2.4} />,
                  onPress: onFinish,
                },
              ]
            : []),
          {
            label: 'Delete workout',
            icon: <Trash2 size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: hasCompletedSets ? () => deleteWorkout(session.id) : cancelWorkout,
          },
        ]}
      />
    </>
  )
}

