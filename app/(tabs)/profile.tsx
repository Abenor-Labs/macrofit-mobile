import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import {
  Activity,
  Bookmark,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  LogOut,
  Moon,
  Repeat,
  Ruler,
  Salad,
  Scale,
  Sparkles,
  Sun,
  Target,
  Trash2,
  TriangleAlert,
  User as UserIcon,
} from 'lucide-react-native'

import type {
  ActivityLevel,
  BodyMeasurement,
  MacroGoals,
  Recommendation,
  UserProfile,
  WeightGoal,
} from '@core/types'
import {
  calculateBMI,
  calculateBMR,
  calculateCalorieGoal,
  calculateMacroGoals,
  calculateTDEE,
  cmToFeetInches,
  formatDate,
  getBMICategory,
  getTodayString,
} from '@core/utils/calculations'
import {
  AGE_RANGE,
  HEIGHT_CM_RANGE,
  cmFromFeetInches,
  feetInchesFromCm,
} from '@core/utils/onboarding'
import { estimateBodyComposition, latestUsableMeasurement } from '@core/utils/bodyComposition'

import { useStore } from '@/store/useStore'
import { useAuth } from '@/lib/AuthProvider'
import { useHealthSync } from '@/hooks/useHealthSync'
import { useLogWeight } from '@/hooks/useLogWeight'
import { isFullyDenied, missingGrantLabels, openHealthConnectInstall } from '@/lib/healthConnect'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { GlassSurface, Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { Field, Pill, Screen } from '@/components/Layout'
import { WeightTargetCard } from '@/components/WeightTarget'
import { UpdatePanel } from '@/components/UpdatePanel'
import * as Application from 'expo-application'

const LBS_PER_KG = 2.20462

/**
 * Where the user's current targets came from.
 *
 * There is no flag in the store recording this, so it is derived: run the same formula
 * `recalculateGoals` uses and compare. If the targets match it, nothing has been chosen and
 * the formula is free to move them. If they match the accepted coach plan, they are a
 * decision. Anything else is a number the user typed.
 */
type GoalsOrigin = 'formula' | 'coach' | 'manual'

const goalsOriginOf = (
  profile: UserProfile,
  currentWeightKg: number,
  goals: MacroGoals,
  recommendation: Recommendation | null
): GoalsOrigin => {
  const bmr = calculateBMR(profile, currentWeightKg)
  const tdee = calculateTDEE(bmr, profile.activityLevel)
  const calories = calculateCalorieGoal(tdee, profile.goal)
  const formula = calculateMacroGoals(
    calories,
    goals.proteinPct,
    goals.carbsPct,
    goals.fatPct,
    currentWeightKg
  )
  const matches = (a: MacroGoals | typeof formula, b: MacroGoals): boolean =>
    a.calories === b.calories && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat

  if (matches(formula, goals)) return 'formula'
  if (recommendation && matches(recommendation as unknown as MacroGoals, goals)) return 'coach'
  return 'manual'
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  lightly_active: 'Lightly active',
  moderately_active: 'Moderately active',
  very_active: 'Very active',
  extra_active: 'Extra active',
}

const GOAL_LABELS: Record<WeightGoal, string> = {
  lose: 'Lose fat',
  maintain: 'Maintain',
  gain: 'Gain weight',
}

const MEASUREMENT_FIELDS: { key: keyof BodyMeasurement; label: string }[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'chest', label: 'Chest' },
]

/**
 * A named run of related sections, drawn as one card.
 *
 * Every section used to carry its own Surface, so the screen was eleven identically
 * weighted cards with no order to them — Targets looked exactly as important as Meal
 * templates, and finding either meant reading all eleven. Three named groups give the
 * screen a shape you can skim, and drop eight card borders and the gaps between them.
 */
const SectionGroup: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => {
  // Rendered rather than passed down, so a Section never has to know its own position.
  const rows = React.Children.toArray(children).filter(React.isValidElement)

  return (
    <View style={{ gap: spacing.sm }}>
      <Label style={{ paddingHorizontal: spacing.xs }}>{label}</Label>
      <Surface>
        {rows.map((row, index) => (
          <React.Fragment key={row.key ?? index}>
            {index > 0 ? <Divider /> : null}
            {row}
          </React.Fragment>
        ))}
      </Surface>
    </View>
  )
}

/** Hairline between two sections inside a group. */
const Divider: React.FC = () => {
  const theme = useTheme()
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth * 2,
        backgroundColor: theme.border,
        marginHorizontal: spacing.lg,
      }}
    />
  )
}

/**
 * A disclosure section. Keeps the page scannable instead of one long wall of controls.
 *
 * Draws no card of its own — SectionGroup owns that. The chevron still expands in place, so
 * grouping costs nothing in reach: everything is one tap away exactly as it was.
 */
const Section: React.FC<{
  title: string
  icon: React.ReactNode
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, subtitle, defaultOpen = false, children }) => {
  const theme = useTheme()
  const [open, setOpen] = useState(defaultOpen)
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? 'Collapse' : 'Expand'}`}
        onPress={() => setOpen(v => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          padding: spacing.lg,
          minHeight: 56,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.tight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.border,
          }}
        >
          {icon}
        </View>
        <View style={{ flex: 1 }}>
          <Body weight="semibold">{title}</Body>
          {subtitle ? (
            <Body size={12} tone="muted" numberOfLines={1}>
              {subtitle}
            </Body>
          ) : null}
        </View>
        <Chevron size={18} color={theme.textMuted} strokeWidth={2} />
      </Pressable>

      {open && (
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            gap: spacing.lg,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: theme.border,
            paddingTop: spacing.lg,
          }}
        >
          {children}
        </View>
      )}
    </View>
  )
}

/** Horizontal choice row. Selection is carried by fill AND weight, never colour alone. */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (next: T) => void
}) {
  const theme = useTheme()
  return (
    <View style={{ gap: spacing.sm }}>
      <Label>{label}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {options.map(option => {
            const active = option.value === value
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                onPress={() => onChange(option.value)}
                style={{
                  minHeight: 40,
                  justifyContent: 'center',
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: active ? theme.brand : theme.border,
                  backgroundColor: active ? theme.brand : 'transparent',
                }}
              >
                <Body
                  size={13}
                  weight={active ? 'semibold' : 'medium'}
                  style={{ color: active ? theme.brandOn : theme.textSecondary }}
                >
                  {option.label}
                </Body>
              </Pressable>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ flexDirection: 'row', gap: spacing.md }}>{children}</View>
)

/**
 * The accepted height range, spoken in the unit the user is typing in.
 *
 * Onboarding and this screen share `HEIGHT_CM_RANGE`, which is metric because the store is.
 * Quoting it in centimetres to someone entering feet and inches hands them a bound they
 * cannot check without doing the conversion the app exists to do for them.
 */
const heightRangeMessage = (unit: UserProfile['heightUnit']): string => {
  if (unit === 'cm') {
    return `Height should be between ${HEIGHT_CM_RANGE.min} and ${HEIGHT_CM_RANGE.max} cm.`
  }
  const low = feetInchesFromCm(HEIGHT_CM_RANGE.min)
  const high = feetInchesFromCm(HEIGHT_CM_RANGE.max)
  return `Height should be between ${low.feet} ft ${low.inches} in and ${high.feet} ft ${high.inches} in.`
}

export default function ProfileScreen() {
  const theme = useTheme()
  const { user, signOut, syncStatus, syncBlocked, hasUnsyncedChanges } = useAuth()

  const profile = useStore(s => s.profile)
  const updateProfile = useStore(s => s.updateProfile)
  const recalculateGoals = useStore(s => s.recalculateGoals)
  const goals = useStore(s => s.goals)
  const recommendation = useStore(s => s.recommendation)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const weightLog = useStore(s => s.weightLog)
  const { removeWeight } = useLogWeight()
  const bodyMeasurements = useStore(s => s.bodyMeasurements)
  const addBodyMeasurement = useStore(s => s.addBodyMeasurement)
  const removeBodyMeasurement = useStore(s => s.removeBodyMeasurement)
  const customFoods = useStore(s => s.customFoods)
  const removeCustomFood = useStore(s => s.removeCustomFood)
  const mealTemplates = useStore(s => s.mealTemplates)
  const deleteMealTemplate = useStore(s => s.deleteMealTemplate)
  const streak = useStore(s => s.streak)
  const darkMode = useStore(s => s.darkMode)
  const toggleDarkMode = useStore(s => s.toggleDarkMode)
  const resetOnboarding = useStore(s => s.resetOnboarding)

  const health = useHealthSync()
  /**
   * The permission sheet came back with nothing.
   *
   * Needed because "never asked" and "asked and refused" are the same set of grants — all
   * false — and only one of them has "Connect" as a working answer. Health Connect will not
   * prompt a second time, so without this the button sat there looking pressable and did
   * nothing at all on every press after the first.
   */
  const [connectRefused, setConnectRefused] = useState(false)

  const unit = profile.weightUnit
  const toDisplay = (kg: number): number =>
    Math.round((unit === 'lbs' ? kg * LBS_PER_KG : kg) * 10) / 10

  const bmi = calculateBMI(currentWeightKg, profile.heightCm)
  const bmiCategory = getBMICategory(bmi)

  const bodyComp = useMemo(() => {
    const measurement = latestUsableMeasurement(bodyMeasurements ?? [], profile, currentWeightKg)
    return measurement ? estimateBodyComposition(profile, currentWeightKg, measurement) : null
  }, [bodyMeasurements, profile, currentWeightKg])

  const [name, setName] = useState(profile.name)
  const [age, setAge] = useState(String(profile.age))
  /*
    Height is stored in centimetres and always has been; only the entry changes with
    `profile.heightUnit`. Both spellings are held so switching the unit does not lose what
    was typed, and `heightCm` stays the single value `commitBasics` writes.

    This screen used to render one field hardcoded to "Height (cm)" and parse it as
    centimetres whatever the user's preference said — so someone on ft/in was shown a cm box
    under a setting that claimed otherwise, two rows above the control that set it.
  */
  const [heightCm, setHeightCm] = useState(String(profile.heightCm))
  const [heightFt, setHeightFt] = useState(() => String(feetInchesFromCm(profile.heightCm).feet))
  const [heightIn, setHeightIn] = useState(() => String(feetInchesFromCm(profile.heightCm).inches))
  const [targetWeight, setTargetWeight] = useState(
    profile.targetWeightKg === undefined ? '' : String(toDisplay(profile.targetWeightKg)),
  )
  const [stepGoal, setStepGoal] = useState(
    profile.stepGoal === undefined ? '' : String(profile.stepGoal),
  )
  const [measurement, setMeasurement] = useState<Record<string, string>>({})

  /*
    These fields seed themselves once, at mount. A hydration replaces the store's profile
    wholesale — a sync retry, or signing in after an outage — and without this the inputs
    keep their pre-hydration text, so the next blur commits stale values back over the
    fresh ones and calls recalculateGoals() with them.

    Comparing against the last *store* value rather than the current text means the user's
    own edits re-seed to what they just typed (a no-op), while a change from anywhere else
    wins.
  */
  const seededRef = useRef({
    name: profile.name,
    age: profile.age,
    heightCm: profile.heightCm,
    targetWeightKg: profile.targetWeightKg,
    stepGoal: profile.stepGoal,
    weightUnit: profile.weightUnit,
  })
  useEffect(() => {
    const seeded = seededRef.current
    if (profile.name !== seeded.name) setName(profile.name)
    if (profile.age !== seeded.age) setAge(String(profile.age))
    if (profile.heightCm !== seeded.heightCm) {
      setHeightCm(String(profile.heightCm))
      const { feet, inches } = feetInchesFromCm(profile.heightCm)
      setHeightFt(String(feet))
      setHeightIn(String(inches))
    }
    // Target weight is displayed in the user's unit, so a unit change has to re-render the
    // text even when the underlying kg value did not move — otherwise the next blur commits
    // a lbs figure as if it were the kg one.
    if (
      profile.targetWeightKg !== seeded.targetWeightKg ||
      profile.weightUnit !== seeded.weightUnit
    ) {
      setTargetWeight(
        profile.targetWeightKg === undefined ? '' : String(toDisplay(profile.targetWeightKg))
      )
    }
    if (profile.stepGoal !== seeded.stepGoal) {
      setStepGoal(profile.stepGoal === undefined ? '' : String(profile.stepGoal))
    }
    seededRef.current = {
      name: profile.name,
      age: profile.age,
      heightCm: profile.heightCm,
      targetWeightKg: profile.targetWeightKg,
      stepGoal: profile.stepGoal,
      weightUnit: profile.weightUnit,
    }
    // `toDisplay` closes over `unit`, which is `profile.weightUnit` — already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile.name,
    profile.age,
    profile.heightCm,
    profile.targetWeightKg,
    profile.stepGoal,
    profile.weightUnit,
  ])

  const [basicsError, setBasicsError] = useState<string | null>(null)
  /** What just happened to the targets. Profile shows no calorie number, so without this
      the user gets no feedback at all from a control that changes one. */
  const [targetsNotice, setTargetsNotice] = useState<string | null>(null)

  /**
   * Apply a change to the body details that feed the calorie formula, then decide what
   * that means for the targets.
   *
   * It used to mean "recalculate, always". Correcting a typo in your own name therefore
   * replaced an accepted coach plan, or targets you had set by hand, with the flat plus or
   * minus 500 — silently, from four different controls, with no undo.
   *
   * Targets that still match the formula are not a decision, so they follow it. A coach
   * plan is a decision and is never overwritten; the coach raises its own alert when it
   * goes stale. Anything hand-set is a decision too, but one the user may want to revisit,
   * so it asks.
   */
  const applyBodyChange = (changed: boolean, mutate: () => void) => {
    mutate()
    /*
      Only a real change to a number the formula reads is worth asking about. Without this,
      the dialog fired on every blur of the Name field, and on tapping into Age and straight
      back out — asking whether to recalculate calories because someone fixed a typo.
    */
    if (!changed) return

    const origin = goalsOriginOf(profile, currentWeightKg, goals, recommendation)
    if (origin === 'formula') {
      recalculateGoals()
      return
    }
    // A coach plan is a decision. Say that it was left alone rather than doing nothing
    // visible: this screen shows no calorie number, so silence is indistinguishable from
    // the app ignoring the change.
    if (origin === 'coach') {
      setTargetsNotice('Your accepted coach plan is unchanged. Refresh it on Goals to use your new details.')
      return
    }
    Alert.alert(
      'Update your targets?',
      'Your targets came from your setup answers. Recalculate them from your new details, or keep what you have?',
      [
        { text: 'Keep mine', style: 'cancel' },
        {
          text: 'Recalculate',
          onPress: () => {
            const before = useStore.getState().goals.calories
            recalculateGoals()
            const after = useStore.getState().goals.calories
            setTargetsNotice(
              before === after
                ? 'Your daily target is unchanged.'
                : `Your daily target moved from ${before.toLocaleString()} to ${after.toLocaleString()} kcal.`
            )
          },
        },
      ]
    )
  }

  const commitBasics = () => {
    const parsedAge = Number(age)
    // Whichever pair of fields is on screen resolves to the same stored centimetres. An
    // empty feet box with inches filled is treated as 0 ft rather than as NaN, because
    // "11 inches" is a typo in progress, not a height.
    const parsedHeight =
      profile.heightUnit === 'ft'
        ? cmFromFeetInches(Number(heightFt) || 0, Number(heightIn) || 0)
        : Number(heightCm)
    // Whether the user has put anything in the height fields at all. An untouched, empty
    // field is not a rejected value and must not raise the range error.
    const heightTouched =
      profile.heightUnit === 'ft'
        ? heightFt.trim() !== '' || heightIn.trim() !== ''
        : heightCm.trim() !== ''

    /*
      Onboarding enforces these bounds; this screen used to accept anything positive, so a
      slipped decimal could set a height of 17 cm and drive BMR, TDEE and every target from
      it. Same ranges, same source.
    */
    const nextAge =
      Number.isFinite(parsedAge) && parsedAge >= AGE_RANGE.min && parsedAge <= AGE_RANGE.max
        ? Math.round(parsedAge)
        : null
    const nextHeight =
      Number.isFinite(parsedHeight) &&
      parsedHeight >= HEIGHT_CM_RANGE.min &&
      parsedHeight <= HEIGHT_CM_RANGE.max
        ? Math.round(parsedHeight)
        : null

    setBasicsError(
      nextAge === null && age.trim() !== ''
        ? `Age should be between ${AGE_RANGE.min} and ${AGE_RANGE.max}.`
        : nextHeight === null && heightTouched
          ? // Names the range in the unit the user is actually typing in. Quoting centimetres
            // at someone entering feet gives them a bound they cannot check without doing the
            // conversion the app is supposed to be doing for them.
            heightRangeMessage(profile.heightUnit)
          : null
    )

    // A rejected value leaves the stored one alone rather than silently keeping the text.
    if (nextAge === null) setAge(String(profile.age))
    if (nextHeight === null) {
      setHeightCm(String(profile.heightCm))
      const { feet, inches } = feetInchesFromCm(profile.heightCm)
      setHeightFt(String(feet))
      setHeightIn(String(inches))
    }

    const finalAge = nextAge ?? profile.age
    const finalHeight = nextHeight ?? profile.heightCm
    // The name is not an input to any formula, so editing it must never raise the dialog.
    const bodyChanged = finalAge !== profile.age || finalHeight !== profile.heightCm

    applyBodyChange(bodyChanged, () => {
      updateProfile({
        name: name.trim() || 'You',
        age: finalAge,
        heightCm: finalHeight,
      })
    })
  }

  const commitTargetWeight = () => {
    const raw = targetWeight.replace(',', '.').trim()
    if (raw === '') {
      seededRef.current.targetWeightKg = undefined
      updateProfile({ targetWeightKg: undefined })
      return
    }
    const value = Number(raw)
    if (!Number.isFinite(value) || value <= 0) return
    const kg = unit === 'lbs' ? value / LBS_PER_KG : value
    const rounded = Math.round(kg * 10) / 10
    /*
      Claim the new value before writing it, so the re-seed effect sees no change and leaves
      the field alone. Otherwise the value the user typed is round-tripped through kg and
      handed back rounded: 180 lb becomes 81.6 kg becomes "179.9" under their cursor.
    */
    seededRef.current.targetWeightKg = rounded
    updateProfile({ targetWeightKg: rounded })
  }

  const commitStepGoal = () => {
    if (stepGoal.trim() === '') {
      seededRef.current.stepGoal = undefined
      updateProfile({ stepGoal: undefined })
      return
    }
    const value = Number(stepGoal.trim())
    if (!Number.isFinite(value) || value <= 0) return
    const rounded = Math.round(value)
    // Same reason as commitTargetWeight: claim it first so the re-seed leaves it alone.
    seededRef.current.stepGoal = rounded
    updateProfile({ stepGoal: rounded })
  }

  const addMeasurement = () => {
    const entry: Record<string, unknown> = { date: getTodayString() }
    let any = false
    for (const field of MEASUREMENT_FIELDS) {
      const raw = measurement[field.key as string]
      if (raw === undefined || raw.trim() === '') continue
      const value = Number(raw.replace(',', '.'))
      if (!Number.isFinite(value) || value <= 0) continue
      entry[field.key as string] = value
      any = true
    }
    if (!any) return
    addBodyMeasurement(entry as unknown as Omit<BodyMeasurement, 'id'>)
    setMeasurement({})
  }

  const runSignOut = (warned: boolean) => {
    void signOut({ warnedAboutUnsyncedChanges: warned })
      .then(result => {
        // A sign-out that could not reach the server leaves the session intact. Saying so is
        // the only honest option: the alternative is a user who believes they are signed out
        // handing the phone over while still signed in.
        if (result.error) Alert.alert('Still signed in', result.error)
      })
      .catch(() =>
        Alert.alert(
          'Still signed in',
          'Something went wrong signing out. Check your connection and try again.'
        )
      )
  }

  const confirmResetOnboarding = () => {
    Alert.alert(
      'Re-run setup?',
      "You'll answer the questions your targets are built from again. Your diary, weigh-ins and workouts stay exactly as they are.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-run setup',
          onPress: () => {
            resetOnboarding()
            // RootNavigator watches `onboardedAt` and routes on it, so clearing the flag is
            // enough. Navigating here as well would race that effect.
          },
        },
      ]
    )
  }

  const confirmSignOut = () => {
    // Captured as the dialog opens: this is exactly what the user is being asked to agree
    // to, and it is what gets passed back to signOut as their consent.
    const warned = hasUnsyncedChanges
    Alert.alert(
      'Sign out?',
      warned
        ? 'Some of what you logged has not reached your account yet, and signing out clears this device. That work would be lost.'
        : 'Your data is saved to your account, and this device will be cleared.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: warned ? 'Sign out anyway' : 'Sign out',
          style: 'destructive',
          onPress: () => runSignOut(warned),
        },
      ]
    )
  }

  // `syncBlocked` outranks `syncStatus`: while the account is unreachable no save is even
  // attempted, so syncStatus sits at its 'idle' default — which used to render as
  // "Synced", directly contradicting the not-synced banner at the top of the screen.
  const syncFailed = syncBlocked || syncStatus === 'error'
  const syncLabel = syncBlocked
    ? 'Not synced — saved on this device only'
    : syncStatus === 'saving'
      ? 'Saving…'
      : syncStatus === 'saved'
        ? 'All changes saved'
        : syncStatus === 'error'
          ? 'Sync failed — will retry'
          : hasUnsyncedChanges
            ? 'Some changes still waiting to sync'
            : 'Synced'

  return (
    <Screen
      title="Profile"
      subtitle={user?.email ?? undefined}
      right={
        <IconButton accessibilityLabel="Open AI Assistant" onPress={() => router.push('/chat')}>
          <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
        </IconButton>
      }
    >
      {/* Identity + the three numbers worth seeing without tapping anything. */}
      <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.brand,
            }}
          >
            <UserIcon size={26} color={theme.brandOn} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <SectionTitle>{profile.name || 'You'}</SectionTitle>
            <Body size={12} tone="muted" numberOfLines={1}>
              {`${GOAL_LABELS[profile.goal]} · ${ACTIVITY_LABELS[profile.activityLevel]}`}
            </Body>
          </View>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {[
            { label: 'Weight', value: String(toDisplay(currentWeightKg)), sub: unit },
            { label: 'BMI', value: String(bmi), sub: bmiCategory.label },
            { label: 'Streak', value: String(streak.current), sub: 'days' },
          ].map(stat => (
            <View key={stat.label} style={{ flex: 1, gap: 2 }}>
              <Label>{stat.label}</Label>
              <StatValue size={24}>{stat.value}</StatValue>
              <Body size={11} tone="muted" numberOfLines={1}>
                {stat.sub}
              </Body>
            </View>
          ))}
        </View>

        {bodyComp && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pill color={theme.brandText}>{`${bodyComp.bodyFatPct}% body fat`}</Pill>
            <Body size={12} tone="muted" numberOfLines={1}>
              {`${Math.round(bodyComp.leanMassKg * 10) / 10} kg lean · Navy method`}
            </Body>
          </View>
        )}
      </GlassSurface>

      {/* The question this screen exists to answer: am I heading the right way? */}
      <WeightTargetCard />

      <SectionGroup label="Your numbers">
      <Section
        title="Targets"
        icon={<Target size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={
          profile.targetWeightKg === undefined
            ? 'No goal weight set'
            : `Goal ${toDisplay(profile.targetWeightKg)} ${unit}`
        }
        defaultOpen={profile.targetWeightKg === undefined}
      >
        <Field
          numeric
          label={`Goal weight (${unit})`}
          value={targetWeight}
          onChangeText={setTargetWeight}
          onBlur={commitTargetWeight}
          placeholder={String(toDisplay(currentWeightKg))}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
        <Body size={12} tone="muted">
          Leave it empty to track weight without a goal. Your pace is measured from your
          actual weigh-ins, not from this number.
        </Body>
      </Section>

      <Section
        title="About you"
        icon={<UserIcon size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={`${profile.age} · ${profile.heightCm} cm (${cmToFeetInches(profile.heightCm)})`}
      >
        <Field label="Name" value={name} onChangeText={setName} onBlur={commitBasics} />
        <Row>
          <View style={{ flex: 1 }}>
            <Field
              numeric
              label="Age"
              value={age}
              onChangeText={setAge}
              onBlur={commitBasics}
              keyboardType="number-pad"
              inputMode="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            {profile.heightUnit === 'ft' ? (
              <View style={{ gap: 6 }}>
                <Label>Height</Label>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Field
                      numeric
                      value={heightFt}
                      onChangeText={setHeightFt}
                      onBlur={commitBasics}
                      placeholder="ft"
                      keyboardType="number-pad"
                      inputMode="numeric"
                      accessibilityLabel="Height, feet"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      numeric
                      value={heightIn}
                      onChangeText={setHeightIn}
                      onBlur={commitBasics}
                      placeholder="in"
                      keyboardType="number-pad"
                      inputMode="numeric"
                      accessibilityLabel="Height, inches"
                    />
                  </View>
                </Row>
              </View>
            ) : (
              <Field
                numeric
                label="Height (cm)"
                value={heightCm}
                onChangeText={setHeightCm}
                onBlur={commitBasics}
                keyboardType="number-pad"
                inputMode="numeric"
              />
            )}
          </View>
        </Row>

        {/* A rejected value snaps back to the stored one, which reads as the app eating the
            input unless it says why. Icon and words, never colour alone. */}
        {basicsError ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <TriangleAlert size={15} color={theme.status.critical} strokeWidth={2} />
            <Body size={13} style={{ flex: 1, color: theme.status.critical }}>
              {basicsError}
            </Body>
          </View>
        ) : null}

        {/* This screen never shows a calorie number, so a control that changes one has to
            say what it did — otherwise "recalculated", "left alone" and "ignored" all look
            identical from here. */}
        {targetsNotice ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <Target size={15} color={theme.brandText} strokeWidth={2} />
            <Body size={13} style={{ flex: 1, color: theme.textSecondary }}>
              {targetsNotice}
            </Body>
          </View>
        ) : null}

        <Choice
          label="Goal"
          value={profile.goal}
          options={(['lose', 'maintain', 'gain'] as WeightGoal[]).map(v => ({
            value: v,
            label: GOAL_LABELS[v],
          }))}
          onChange={v => applyBodyChange(v !== profile.goal, () => updateProfile({ goal: v }))}
        />

        <Choice
          label="Activity level"
          value={profile.activityLevel}
          options={(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map(v => ({
            value: v,
            label: ACTIVITY_LABELS[v],
          }))}
          onChange={v => applyBodyChange(v !== profile.activityLevel, () => updateProfile({ activityLevel: v }))}
        />

        <Choice
          label="Gender (used by the BMR formula)"
          value={profile.gender}
          options={[
            { value: 'male' as const, label: 'Male' },
            { value: 'female' as const, label: 'Female' },
            { value: 'other' as const, label: 'Other' },
          ]}
          onChange={v => applyBodyChange(v !== profile.gender, () => updateProfile({ gender: v }))}
        />

        <Row>
          <View style={{ flex: 1 }}>
            {/* Only the display unit changes; stored values stay metric. */}
            <Choice
              label="Weight unit"
              value={profile.weightUnit}
              options={[
                { value: 'kg' as const, label: 'kg' },
                { value: 'lbs' as const, label: 'lbs' },
              ]}
              onChange={v => updateProfile({ weightUnit: v })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Choice
              label="Height unit"
              value={profile.heightUnit}
              options={[
                { value: 'cm' as const, label: 'cm' },
                { value: 'ft' as const, label: 'ft / in' },
              ]}
              onChange={v => updateProfile({ heightUnit: v })}
            />
          </View>
        </Row>
      </Section>

      <Section
        title="Weight log"
        icon={<Scale size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={`${weightLog.length} entr${weightLog.length === 1 ? 'y' : 'ies'}`}
      >
        {weightLog.length === 0 ? (
          <Body size={13} tone="secondary">
            No weigh-ins yet. Add one from the card above — a handful across a couple of
            weeks is enough to measure a real trend.
          </Body>
        ) : (
          weightLog.slice(0, 20).map(entry => (
            <View
              key={entry.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View style={{ flex: 1 }}>
                <StatValue size={17}>{`${entry.weight} ${unit}`}</StatValue>
                <Body size={11} tone="muted" numberOfLines={1}>
                  {formatDate(entry.date)}
                  {entry.notes ? ` · ${entry.notes}` : ''}
                </Body>
              </View>
              <IconButton
                accessibilityLabel={`Remove weigh-in from ${formatDate(entry.date)}`}
                // Goes through the hook so the Health Connect record goes with it. Calling
                // the store action alone deleted it here and left it visible in Google Fit.
                onPress={() => removeWeight(entry.id, entry.date)}
              >
                <Trash2 size={16} color={theme.status.critical} strokeWidth={2} />
              </IconButton>
            </View>
          ))
        )}
      </Section>

      <Section
        title="Body measurements"
        icon={<Ruler size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={
          bodyComp
            ? `${bodyComp.bodyFatPct}% body fat estimate`
            : 'Add neck and waist for a body-fat estimate'
        }
      >
        {!bodyComp && (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <TriangleAlert size={15} color={theme.status.warning} strokeWidth={2} />
            <Body size={12} tone="secondary" style={{ flex: 1 }}>
              {profile.gender === 'female'
                ? 'Neck, waist and hips are all needed for the Navy body-fat estimate.'
                : 'Neck and waist are both needed for the Navy body-fat estimate.'}
            </Body>
          </View>
        )}

        <Row>
          {MEASUREMENT_FIELDS.slice(0, 2).map(field => (
            <View key={String(field.key)} style={{ flex: 1 }}>
              <Field
                numeric
                label={`${field.label} (cm)`}
                value={measurement[field.key as string] ?? ''}
                onChangeText={v => setMeasurement(prev => ({ ...prev, [field.key as string]: v }))}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            </View>
          ))}
        </Row>
        <Row>
          {MEASUREMENT_FIELDS.slice(2, 4).map(field => (
            <View key={String(field.key)} style={{ flex: 1 }}>
              <Field
                numeric
                label={`${field.label} (cm)`}
                value={measurement[field.key as string] ?? ''}
                onChangeText={v => setMeasurement(prev => ({ ...prev, [field.key as string]: v }))}
                keyboardType="decimal-pad"
                inputMode="decimal"
              />
            </View>
          ))}
        </Row>

        <Button label="Save measurement" onPress={addMeasurement} haptic />

        {bodyMeasurements.slice(0, 5).map(entry => (
          <View
            key={entry.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <View style={{ flex: 1 }}>
              <Body size={13} weight="medium">
                {formatDate(entry.date)}
              </Body>
              <Body size={11} tone="muted" numberOfLines={1}>
                {MEASUREMENT_FIELDS.filter(f => typeof entry[f.key] === 'number')
                  .map(f => `${f.label} ${entry[f.key] as number}`)
                  .join(' · ') || 'No values'}
              </Body>
            </View>
            <IconButton
              accessibilityLabel={`Remove measurement from ${formatDate(entry.date)}`}
              onPress={() => removeBodyMeasurement(entry.id)}
            >
              <Trash2 size={16} color={theme.status.critical} strokeWidth={2} />
            </IconButton>
          </View>
        ))}
      </Section>
      </SectionGroup>

      <SectionGroup label="Saved by you">
      <Section
        title="Custom foods"
        icon={<Salad size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={`${customFoods.length} saved`}
      >
        {customFoods.length === 0 ? (
          <Body size={13} tone="secondary">
            Foods you create while logging show up here.
          </Body>
        ) : (
          customFoods.map(food => (
            <View
              key={food.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View style={{ flex: 1 }}>
                <Body size={14} weight="medium" numberOfLines={1}>
                  {food.name}
                </Body>
                <Body size={11} tone="muted">
                  {`${Math.round(food.calories)} kcal per ${food.servingSize}${food.servingUnit}`}
                </Body>
              </View>
              <IconButton
                accessibilityLabel={`Delete ${food.name}`}
                onPress={() => removeCustomFood(food.id)}
              >
                <Trash2 size={16} color={theme.status.critical} strokeWidth={2} />
              </IconButton>
            </View>
          ))
        )}
      </Section>

      <Section
        title="Meal templates"
        icon={<Bookmark size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={`${mealTemplates.length} saved`}
      >
        {mealTemplates.length === 0 ? (
          <Body size={13} tone="secondary">
            Save a meal as a template from the Diary and it will appear here for one-tap
            re-adding.
          </Body>
        ) : (
          mealTemplates.map(template => (
            <View
              key={template.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View style={{ flex: 1 }}>
                <Body size={14} weight="medium" numberOfLines={1}>
                  {template.name}
                </Body>
                <Body size={11} tone="muted">
                  {`${template.entries.length} item${template.entries.length === 1 ? '' : 's'}`}
                </Body>
              </View>
              <IconButton
                accessibilityLabel={`Delete template ${template.name}`}
                onPress={() => deleteMealTemplate(template.id)}
              >
                <Trash2 size={16} color={theme.status.critical} strokeWidth={2} />
              </IconButton>
            </View>
          ))
        )}
      </Section>
      </SectionGroup>

      <SectionGroup label="App">
      {/*
        First in the group because it is the only entry here that answers a question rather
        than changing a setting, and the questions it answers ("what is the middle number",
        "why did my target move") are the ones a person has before they have any settings
        worth changing.
      */}
      <Section
        title="How it works"
        icon={<BookOpen size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle="What the numbers mean, and where they come from"
      >
        <Body size={13} tone="secondary">
          The ring, the targets, the weight line and the assistant, explained in the order you
          are likely to meet them.
        </Body>
        <Button
          label="Open"
          variant="secondary"
          onPress={() => router.push('/help')}
          icon={<BookOpen size={15} color={theme.text} strokeWidth={2} />}
        />
      </Section>

      {/* Setup you do once. It used to open itself at the top of the screen on every visit,
          pushing everything the user actually came for below the fold. */}
      {health.availability === 'available' && (
        <Section
          title="Health Connect"
          icon={<Activity size={16} color={theme.brandText} strokeWidth={2} />}
          /*
            Three states, not two. "Connected" used to mean "at least one permission was
            granted", so a user who allowed weight and refused steps read Connected here and
            then watched the dashboard show zero steps forever with no way to connect the two
            facts. Partial access is its own answer and has to say so.
          */
          subtitle={
            health.granted
              ? 'Connected'
              : isFullyDenied(health.grants)
                ? 'Not connected'
                : `Partly connected — ${missingGrantLabels(health.grants).join(', ')} not allowed`
          }
        >
          {!isFullyDenied(health.grants) && !health.granted && (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
              <TriangleAlert size={15} color={theme.status.warning} strokeWidth={2} />
              <Body size={12} tone="secondary" style={{ flex: 1 }}>
                {`MacroFit was not given access to ${missingGrantLabels(health.grants).join(', ')}. Health Connect only asks once, so this has to be changed in its own settings.`}
              </Body>
            </View>
          )}

          {!isFullyDenied(health.grants) && !health.granted && (
            <Button
              label="Open Health Connect settings"
              variant="secondary"
              onPress={() => void health.openSettings()}
              icon={<Activity size={15} color={theme.text} strokeWidth={2} />}
            />
          )}

          {health.grants.readWeight ? (
            <>
              <Body size={13} tone="secondary">
                {health.grants.readSteps
                  ? 'Steps are read automatically. You can also pull in bodyweight recorded by your phone or scale — days you already logged yourself are never overwritten.'
                  : 'You can pull in bodyweight recorded by your phone or scale — days you already logged yourself are never overwritten.'}
              </Body>
              {!health.grants.readHistory && (
                <Body size={12} tone="muted">
                  {/* Android 14+ caps every read at 30 days without the history permission, so
                      promising "any weigh-ins already recorded" would be untrue here. */}
                  Only the last 30 days can be imported until you allow access to past data in
                  Health Connect.
                </Body>
              )}
              <Button
                label="Import weight history"
                variant="secondary"
                onPress={() => void health.importWeightHistory()}
                loading={health.busy}
                icon={<Download size={15} color={theme.text} strokeWidth={2} />}
              />
              {health.importedWeights !== null && (
                <Body size={12} tone="muted">
                  {health.importedWeights === 0
                    ? 'No new weigh-ins found — everything on file is already logged.'
                    : `Imported ${health.importedWeights} weigh-in${health.importedWeights === 1 ? '' : 's'}.`}
                </Body>
              )}
              {/* A step goal is only a setting if steps can be read. Offering it otherwise
                  invites the user to configure a number nothing will ever fill in. */}
              {health.grants.readSteps && (
                <Field
                  numeric
                  label="Daily step goal"
                  value={stepGoal}
                  onChangeText={setStepGoal}
                  onBlur={commitStepGoal}
                  placeholder="8000"
                  keyboardType="number-pad"
                  inputMode="numeric"
                />
              )}
              {/* Says what the sync actually guarantees. "Synced to Google Fit" would be a
                  promise this app cannot keep: whether Fit displays a Health Connect record
                  depends on a setting inside Fit, which is off by default. */}
              {health.grants.writeWeight && (
                <Body size={12} tone="muted">
                  Weights you log here are saved to Health Connect. Google Fit shows them if
                  Fit is set to sync with Health Connect.
                </Body>
              )}

              {/*
                What else is flowing, named one line at a time.

                Each of these is its own permission and any of them can be off while the rest
                are on, so a single sentence covering "syncing" would be wrong for most people.
                Listing only what is actually granted also means the list doubles as the answer
                to "why is my food not showing up in Fit".
              */}
              {(health.grants.writeNutrition ||
                health.grants.writeExercise ||
                health.grants.writeHydration) && (
                <View style={{ gap: 4 }}>
                  <Label>Also sent to Health Connect</Label>
                  {health.grants.writeNutrition && (
                    <Body size={12} tone="muted">
                      Meals you log, one entry per meal per day, with calories and macros.
                    </Body>
                  )}
                  {health.grants.writeExercise && (
                    <Body size={12} tone="muted">
                      Workouts, once you finish them.
                    </Body>
                  )}
                  {health.grants.writeHydration && (
                    <Body size={12} tone="muted">
                      Water intake.
                    </Body>
                  )}
                </View>
              )}

              {/*
                Reads the app cannot promise will contain anything.

                Health Connect stores what other apps write, and most phones write no calorie
                total at all — Google Fit largely does not. Saying "your burn will appear here"
                would be a promise about someone else's app, so this reports the state instead.
              */}
              {(health.grants.readTotalCalories || health.grants.readActiveCalories) && (
                <Body size={12} tone="muted">
                  {health.energy.totalKcal === null
                    ? 'No calorie burn on file for today. Most phones record none unless a watch or a fitness app writes it — Goals still uses your own log for that.'
                    : `Your phone recorded ${health.energy.totalKcal} kcal burned today. Goals shows it beside the figure measured from your log.`}
                </Body>
              )}

              {health.grants.readBodyFat && health.measuredBodyFatPct !== null && (
                <Body size={12} tone="muted">
                  {`A scale recorded ${health.measuredBodyFatPct}% body fat. Progress uses that in place of the estimate from your measurements.`}
                </Body>
              )}
            </>
          ) : (
            <>
              <Body size={13} tone="secondary">
                Let MacroFit read steps and bodyweight from Health Connect so you do not
                have to enter data your phone already has. Weights you log here are written
                back, so your other apps stay up to date.
              </Body>
              {connectRefused ? (
                <>
                  <View
                    style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
                  >
                    <TriangleAlert size={15} color={theme.status.warning} strokeWidth={2} />
                    <Body size={12} tone="secondary" style={{ flex: 1 }}>
                      Nothing was shared. Health Connect only asks once, so this has to be turned
                      on in its own settings now.
                    </Body>
                  </View>
                  <Button
                    label="Open Health Connect settings"
                    variant="secondary"
                    onPress={() => void health.openSettings()}
                    icon={<Activity size={15} color={theme.text} strokeWidth={2} />}
                  />
                </>
              ) : (
                <Button
                  label="Connect"
                  loading={health.busy}
                  onPress={() => {
                    void health.connect().then(next => setConnectRefused(isFullyDenied(next)))
                  }}
                />
              )}
            </>
          )}
        </Section>
      )}

      {/*
        Installed is not the same as reachable, and this section used to render for neither.

        `getAvailability` returns 'not_installed' both for an Android old enough that Health
        Connect is a separate download and for a provider too old to talk to this SDK. Every
        surface gated itself on 'available' alone, so the phones one Play Store tap away from
        the entire feature were the only ones never told it existed.
      */}
      {health.availability === 'not_installed' && (
        <Section
          title="Health Connect"
          icon={<Activity size={16} color={theme.brandText} strokeWidth={2} />}
          subtitle="Not installed"
        >
          <Body size={13} tone="secondary">
            Health Connect is the free Google app that holds steps and bodyweight and decides
            which apps may read them. With it installed, MacroFit can read your step count and
            write your weigh-ins back to whatever else you use.
          </Body>
          <Button
            label="Get Health Connect"
            variant="secondary"
            onPress={() => void openHealthConnectInstall()}
            icon={<Download size={15} color={theme.text} strokeWidth={2} />}
          />
        </Section>
      )}

      {/*
        The way out of a wrong answer to "has this person been set up?".

        That question is inferred when account data is loaded, and a wrong inference used to
        be permanent — the user kept the shipped defaults (a 30-year-old, 175 cm, male) as
        the basis of every calorie target, with no route back to the screen that would fix
        it. Every number in the app comes from those four answers, so being unable to re-give
        them is not a small gap.

        Nothing logged is touched. It re-asks the questions; it does not delete the answers
        to anything else.
      */}
      <Section
        title="Setup"
        icon={<Sparkles size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle="Re-answer the questions your targets are built from"
      >
        <Body size={13} tone="secondary">
          Runs through age, height, weight, activity and goal again, then recalculates your
          daily targets. Your diary, weigh-ins and workouts are not affected.
        </Body>
        <Button
          label="Re-run setup"
          variant="secondary"
          onPress={confirmResetOnboarding}
          icon={<Repeat size={15} color={theme.text} strokeWidth={2} />}
        />
      </Section>

      <Section
        title="Appearance"
        icon={
          darkMode ? (
            <Moon size={16} color={theme.brandText} strokeWidth={2} />
          ) : (
            <Sun size={16} color={theme.brandText} strokeWidth={2} />
          )
        }
        subtitle={darkMode ? 'Dark' : 'Light'}
      >
        <Button
          label={darkMode ? 'Switch to light' : 'Switch to dark'}
          variant="secondary"
          onPress={toggleDarkMode}
          icon={
            darkMode ? (
              <Sun size={15} color={theme.text} strokeWidth={2} />
            ) : (
              <Moon size={15} color={theme.text} strokeWidth={2} />
            )
          }
        />
      </Section>

      {/* This build is sideloaded, so there is no store to notice a new version. The subtitle
          carries the installed build number, which is the thing anyone reporting a bug needs to
          be able to read off the screen. */}
      <Section
        title="App version"
        icon={<Download size={16} color={theme.brandText} strokeWidth={2} />}
        subtitle={`${Application.nativeApplicationVersion ?? '—'} (${
          Application.nativeBuildVersion ?? '—'
        })`}
      >
        <UpdatePanel />
      </Section>

      {/* Sync state rides on the row's subtitle rather than needing its own card. It is a
          reassurance, not a task, and it was the only thing on this screen with no header. */}
      <Section
        title="Account"
        icon={
          syncFailed ? (
            <CloudOff size={16} color={theme.status.critical} strokeWidth={2} />
          ) : hasUnsyncedChanges ? (
            <CloudOff size={16} color={theme.status.warning} strokeWidth={2} />
          ) : (
            <Cloud size={16} color={theme.status.good} strokeWidth={2} />
          )
        }
        subtitle={syncLabel}
      >
        <Body size={13} tone="secondary">
          {user?.email ?? 'Not signed in'}
        </Body>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={confirmSignOut}
          icon={<LogOut size={15} color={theme.text} strokeWidth={2} />}
        />
      </Section>
      </SectionGroup>
    </Screen>
  )
}
