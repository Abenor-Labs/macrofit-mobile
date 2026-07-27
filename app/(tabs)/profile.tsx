import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Flame,
  LogIn,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Ruler,
  Scale,
  Target,
  Trash2,
  User as UserIcon,
  Utensils,
} from 'lucide-react-native'

import { router } from 'expo-router'

import { useAuth, type SyncStatus } from '@/lib/AuthProvider'
import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { EmptyState, Field, Pill, Screen } from '@/components/Layout'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import {
  calculateBMI,
  cmToFeetInches,
  formatDate,
  getBMICategory,
  getTodayString,
  kgToLbs,
} from '@core/utils/calculations'
import { estimateBodyComposition, latestUsableMeasurement } from '@core/utils/bodyComposition'
import type {
  ActivityLevel,
  BodyMeasurement,
  MealTemplate,
  UserProfile,
  WeightGoal,
} from '@core/types'

/* ------------------------------------------------------------------ constants */

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Sedentary', hint: 'Desk job, little deliberate exercise' },
  { value: 'lightly_active', label: 'Lightly active', hint: '1-3 sessions a week' },
  { value: 'moderately_active', label: 'Moderately active', hint: '3-5 sessions a week' },
  { value: 'very_active', label: 'Very active', hint: '6-7 sessions a week' },
  { value: 'extra_active', label: 'Extra active', hint: 'Physical job or two-a-days' },
]

const GOAL_OPTIONS: { value: WeightGoal; label: string; spoken: string }[] = [
  { value: 'lose', label: 'Lose', spoken: 'Goal: lose weight' },
  { value: 'maintain', label: 'Maintain', spoken: 'Goal: maintain weight' },
  { value: 'gain', label: 'Gain', spoken: 'Goal: gain weight' },
]

const GENDER_OPTIONS: { value: UserProfile['gender']; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
]

const WEIGHT_UNITS: { value: UserProfile['weightUnit']; spoken: string }[] = [
  { value: 'kg', spoken: 'Show weight in kilograms' },
  { value: 'lbs', spoken: 'Show weight in pounds' },
]

const HEIGHT_UNITS: { value: UserProfile['heightUnit']; spoken: string }[] = [
  { value: 'cm', spoken: 'Show height in centimetres' },
  { value: 'ft', spoken: 'Show height in feet and inches' },
]

type MeasurementKey =
  | 'neck' | 'shoulders' | 'chest' | 'waist' | 'hips' | 'leftArm' | 'rightArm' | 'leftThigh'

const MEASUREMENT_FIELDS: { key: MeasurementKey; label: string }[] = [
  { key: 'neck', label: 'Neck' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'leftArm', label: 'Arm (L)' },
  { key: 'rightArm', label: 'Arm (R)' },
  { key: 'leftThigh', label: 'Thigh' },
]

/** Profile keys that feed BMR/TDEE. Editing one of these re-derives the daily targets. */
const TARGET_KEYS: (keyof UserProfile)[] = ['age', 'gender', 'heightCm', 'activityLevel', 'goal']

const AGE_MIN = 13
const AGE_MAX = 100
const HEIGHT_MIN_CM = 100
const HEIGHT_MAX_CM = 250
/** Same plausible window the Navy estimate uses, so a typo is caught at the input. */
const BODY_FAT_MIN = 3
const BODY_FAT_MAX = 60

/* ------------------------------------------------------------------ helpers */

const oneDp = (value: number): number => Math.round(value * 10) / 10

const isPositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const joinWords = (words: string[]): string =>
  words.length <= 1
    ? words[0] ?? ''
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`

const templateCalories = (template: MealTemplate): number =>
  Math.round(
    template.entries.reduce((sum, entry) => sum + (entry.food?.calories ?? 0) * entry.servings, 0)
  )

/**
 * Feet and inches for the height input. `cmToFeetInches` is the shared display helper but
 * returns a formatted string, and the two inputs need numbers — this is a unit split, not
 * a second copy of a domain formula. Storage stays centimetres either way.
 */
const splitFeetInches = (cm: number): { feet: number; inches: number } => {
  const totalInches = cm / 2.54
  let feet = Math.floor(totalInches / 12)
  let inches = Math.round(totalInches - feet * 12)
  if (inches === 12) {
    feet += 1
    inches = 0
  }
  return { feet, inches }
}

type Tone = 'good' | 'warning'
interface Notice { tone: Tone; text: string }

/** One transient inline message per card, cleared on unmount so no timer outlives it. */
const useFlash = () => {
  const [notice, setNotice] = useState<Notice | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const flash = useCallback((tone: Tone, text: string) => {
    setNotice({ tone, text })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(null), 4000)
  }, [])

  return { notice, flash }
}

/* ------------------------------------------------------------------ pieces */

const NoticeLine: React.FC<{ notice: Notice }> = ({ notice }) => {
  const theme = useTheme()
  const color = notice.tone === 'good' ? theme.status.good : theme.status.warning
  const Icon = notice.tone === 'good' ? CheckCircle2 : AlertTriangle
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <Icon size={16} color={color} />
      <Body size={13} weight="medium" style={{ color, flex: 1 }}>
        {notice.text}
      </Body>
    </View>
  )
}

const IconBadge: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 36,
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.tight,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.border,
      }}
    >
      {children}
    </View>
  )
}

const CountPill: React.FC<{ value: number; noun: string }> = ({ value, noun }) => (
  <Pill>
    <StatValue size={13}>{value}</StatValue>
    <Body size={12} tone="secondary">
      {noun}
    </Body>
  </Pill>
)

/** A labelled figure: the number always wears the display face. */
const Metric: React.FC<{ label: string; value: number; unit?: string; color?: string }> = ({
  label,
  value,
  unit,
  color,
}) => (
  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
    <Body size={11} tone="muted">
      {label}
    </Body>
    <StatValue size={13} color={color}>
      {value}
    </StatValue>
    {unit ? (
      <Body size={11} tone="muted">
        {unit}
      </Body>
    ) : null}
  </View>
)

const Card: React.FC<{
  title: string
  icon: React.ReactNode
  badge?: React.ReactNode
  collapsible?: boolean
  initiallyOpen?: boolean
  children: React.ReactNode
}> = ({ title, icon, badge, collapsible = false, initiallyOpen = true, children }) => {
  const theme = useTheme()
  const [open, setOpen] = useState(initiallyOpen)
  const Chevron = open ? ChevronUp : ChevronDown

  const header = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: HIT_SIZE,
      }}
    >
      <IconBadge>{icon}</IconBadge>
      <View style={{ flex: 1 }}>
        <SectionTitle>{title}</SectionTitle>
      </View>
      {badge}
      {collapsible ? <Chevron size={20} color={theme.textMuted} /> : null}
    </View>
  )

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={open ? `Collapse ${title}` : `Expand ${title}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(value => !value)}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {collapsible && !open ? null : children}
    </Surface>
  )
}

const Choice: React.FC<{
  label: string
  selected: boolean
  onPress: () => void
  /** Spoken label, when the visible one is too terse to stand alone ("kg", "Lose"). */
  a11yLabel?: string
  style?: StyleProp<ViewStyle>
}> = ({ label, selected, onPress, a11yLabel, style }) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: HIT_SIZE,
          paddingHorizontal: spacing.md,
          borderRadius: radius.control,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: selected ? theme.brand : theme.border,
          backgroundColor: selected ? theme.brand : pressed ? theme.border : 'transparent',
        },
        style,
      ]}
    >
      <Body
        size={14}
        weight={selected ? 'semibold' : 'medium'}
        style={{ color: selected ? theme.brandOn : theme.text }}
      >
        {label}
      </Body>
    </Pressable>
  )
}

const OptionRow: React.FC<{
  label: string
  hint: string
  selected: boolean
  onPress: () => void
}> = ({ label, hint, selected, onPress }) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${hint}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: HIT_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: selected ? theme.brand : theme.border,
        backgroundColor: pressed ? theme.border : 'transparent',
      })}
    >
      <View style={{ flex: 1 }}>
        <Body size={14} weight={selected ? 'semibold' : 'medium'}>
          {label}
        </Body>
        <Body size={12} tone="muted">
          {hint}
        </Body>
      </View>
      {/* Shape, not hue: the check survives greyscale and colour-blind vision. */}
      {selected ? <CheckCircle2 size={18} color={theme.brandText} /> : null}
    </Pressable>
  )
}

const Row: React.FC<{ children: React.ReactNode; first?: boolean }> = ({ children, first }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth * 2,
        borderTopColor: theme.border,
      }}
    >
      {children}
    </View>
  )
}

const Tile: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        gap: spacing.xs,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: theme.border,
        backgroundColor: theme.canvas,
      }}
    >
      {children}
      <Label>{label}</Label>
    </View>
  )
}

const HalfField: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View style={{ flex: 1 }}>{children}</View>
)

/* ------------------------------------------------------------------ screen */

export default function ProfileScreen() {
  const theme = useTheme()
  const { user, signOut, syncStatus } = useAuth()

  const profile = useStore(s => s.profile)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const weightLog = useStore(s => s.weightLog)
  const streak = useStore(s => s.streak)
  const customFoods = useStore(s => s.customFoods)
  const mealTemplates = useStore(s => s.mealTemplates)
  const bodyMeasurements = useStore(s => s.bodyMeasurements)
  const darkMode = useStore(s => s.darkMode)

  const updateProfile = useStore(s => s.updateProfile)
  const recalculateGoals = useStore(s => s.recalculateGoals)
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const removeWeightEntry = useStore(s => s.removeWeightEntry)
  const addBodyMeasurement = useStore(s => s.addBodyMeasurement)
  const removeBodyMeasurement = useStore(s => s.removeBodyMeasurement)
  const removeCustomFood = useStore(s => s.removeCustomFood)
  const deleteMealTemplate = useStore(s => s.deleteMealTemplate)
  const toggleDarkMode = useStore(s => s.toggleDarkMode)

  const details = useFlash()
  const weighIn = useFlash()
  const tape = useFlash()

  /* --- profile drafts. Committed on blur, re-seeded when the stored value changes
         (cloud sync), which never happens mid-edit because nothing commits per keystroke. */
  const [nameDraft, setNameDraft] = useState(profile.name)
  const [ageDraft, setAgeDraft] = useState(String(profile.age))
  const [cmDraft, setCmDraft] = useState(String(profile.heightCm))
  const [feetDraft, setFeetDraft] = useState(() => String(splitFeetInches(profile.heightCm).feet))
  const [inchesDraft, setInchesDraft] = useState(() =>
    String(splitFeetInches(profile.heightCm).inches)
  )

  useEffect(() => {
    setNameDraft(profile.name)
  }, [profile.name])

  useEffect(() => {
    setAgeDraft(String(profile.age))
  }, [profile.age])

  useEffect(() => {
    const { feet, inches } = splitFeetInches(profile.heightCm)
    setCmDraft(String(profile.heightCm))
    setFeetDraft(String(feet))
    setInchesDraft(String(inches))
  }, [profile.heightCm])

  const saveProfile = (updates: Partial<UserProfile>) => {
    updateProfile(updates)
    const touchesTargets = Object.keys(updates).some(key =>
      TARGET_KEYS.includes(key as keyof UserProfile)
    )
    // Only re-derive when a field that actually feeds BMR/TDEE moved. A name change or a
    // unit toggle must never overwrite calories the user (or the coach) set.
    if (touchesTargets) recalculateGoals()
    details.flash('good', touchesTargets ? 'Saved — daily targets recalculated' : 'Saved')
  }

  const commitName = () => {
    const next = nameDraft.trim()
    if (!next) {
      setNameDraft(profile.name)
      details.flash('warning', 'Name cannot be empty.')
      return
    }
    if (next === profile.name) return
    saveProfile({ name: next })
  }

  const commitAge = () => {
    const next = Math.round(Number(ageDraft))
    if (!Number.isFinite(next) || next < AGE_MIN || next > AGE_MAX) {
      setAgeDraft(String(profile.age))
      details.flash('warning', `Age must be between ${AGE_MIN} and ${AGE_MAX}.`)
      return
    }
    if (next === profile.age) return
    saveProfile({ age: next })
  }

  const commitHeightCm = (nextCm: number) => {
    if (!Number.isFinite(nextCm) || nextCm < HEIGHT_MIN_CM || nextCm > HEIGHT_MAX_CM) {
      const { feet, inches } = splitFeetInches(profile.heightCm)
      setCmDraft(String(profile.heightCm))
      setFeetDraft(String(feet))
      setInchesDraft(String(inches))
      details.flash(
        'warning',
        `Height must be between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM} cm (3'3" to 8'2").`
      )
      return
    }
    if (nextCm === profile.heightCm) return
    saveProfile({ heightCm: nextCm })
  }

  const commitCm = () => commitHeightCm(Math.round(Number(cmDraft)))

  const commitFeetInches = () => {
    const feet = Math.round(Number(feetDraft))
    const inches = Math.round(Number(inchesDraft))
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      commitHeightCm(NaN)
      return
    }
    // Storage is always centimetres — the imperial fields are a display convenience only.
    commitHeightCm(Math.round((feet * 12 + inches) * 2.54))
  }

  /* --- headline stats */
  const hasWeight = isPositive(currentWeightKg)
  const hasHeight = isPositive(profile.heightCm)
  const displayWeight = profile.weightUnit === 'lbs' ? kgToLbs(currentWeightKg) : oneDp(currentWeightKg)
  const bmi = hasWeight && hasHeight ? calculateBMI(currentWeightKg, profile.heightCm) : null
  const bmiCategory = bmi === null ? null : getBMICategory(bmi).label
  const bmiTone: 'good' | 'warning' | 'critical' =
    bmi === null ? 'good' : bmi < 18.5 ? 'warning' : bmi < 25 ? 'good' : bmi < 30 ? 'warning' : 'critical'
  const bmiColor = theme.status[bmiTone]
  const BmiIcon = bmiTone === 'good' ? CheckCircle2 : bmiTone === 'warning' ? AlertTriangle : AlertCircle

  /* --- weigh-in form */
  const [weightDraft, setWeightDraft] = useState('')
  const [bodyFatDraft, setBodyFatDraft] = useState('')

  const logWeight = () => {
    const value = Number(weightDraft)
    if (!weightDraft.trim() || !Number.isFinite(value) || value <= 0) {
      weighIn.flash('warning', `Enter a weight in ${profile.weightUnit}.`)
      return
    }
    let bodyFat: number | undefined
    if (bodyFatDraft.trim()) {
      const parsed = Number(bodyFatDraft)
      if (!Number.isFinite(parsed) || parsed < BODY_FAT_MIN || parsed > BODY_FAT_MAX) {
        weighIn.flash('warning', `Body fat must be between ${BODY_FAT_MIN}% and ${BODY_FAT_MAX}%.`)
        return
      }
      bodyFat = parsed
    }
    // The store converts to kg using profile.weightUnit before touching currentWeightKg,
    // so the value handed over here is in the unit the user just typed.
    addWeightEntry({ date: getTodayString(), weight: value, bodyFat })
    setWeightDraft('')
    setBodyFatDraft('')
    weighIn.flash('good', 'Weigh-in logged')
  }

  /* --- body measurements */
  const [tapeDraft, setTapeDraft] = useState<Partial<Record<MeasurementKey, string>>>({})

  const saveMeasurements = () => {
    const next: Omit<BodyMeasurement, 'id'> = { date: getTodayString() }
    let any = false
    for (const { key } of MEASUREMENT_FIELDS) {
      const raw = tapeDraft[key]
      if (!raw || !raw.trim()) continue
      const value = Number(raw)
      if (!Number.isFinite(value) || value <= 0) {
        tape.flash('warning', 'Measurements must be positive numbers, in centimetres.')
        return
      }
      next[key] = value
      any = true
    }
    if (!any) {
      tape.flash('warning', 'Enter at least one measurement.')
      return
    }
    addBodyMeasurement(next)
    setTapeDraft({})
    tape.flash('good', 'Measurements saved')
  }

  const measurementsByDate = useMemo(
    () => [...bodyMeasurements].sort((a, b) => b.date.localeCompare(a.date)),
    [bodyMeasurements]
  )

  const composition = useMemo(() => {
    const usable = latestUsableMeasurement(bodyMeasurements, profile, currentWeightKg)
    return usable ? estimateBodyComposition(profile, currentWeightKg, usable) : null
  }, [bodyMeasurements, profile, currentWeightKg])

  // Never guess a percentage: when the tape data cannot support the Navy formula, say
  // exactly which measurement is missing instead.
  const compositionHint = useMemo(() => {
    if (!hasHeight) return 'Add your height above — the Navy estimate needs it.'
    if (!hasWeight) return 'Log a weigh-in first — the estimate needs your current weight.'

    const required: MeasurementKey[] =
      profile.gender === 'female' ? ['neck', 'waist', 'hips'] : ['neck', 'waist']
    const newest = measurementsByDate[0]

    if (!newest) {
      return `No measurements yet. The Navy method needs your ${joinWords(required)} in centimetres.`
    }
    const missing = required.filter(key => !isPositive(newest[key]))
    if (missing.length > 0) {
      return `Your latest measurement is missing ${joinWords(missing)}. Add ${
        missing.length > 1 ? 'those' : 'that'
      } to estimate body fat.`
    }
    return 'Those numbers do not produce a plausible estimate. Check the tape values — everything is in centimetres.'
  }, [hasHeight, hasWeight, profile.gender, measurementsByDate])

  const leanMassDisplay =
    composition === null
      ? 0
      : profile.weightUnit === 'lbs'
        ? kgToLbs(composition.leanMassKg)
        : oneDp(composition.leanMassKg)

  /* --- account */
  const sync = syncStatusMeta(syncStatus, !!user, theme.status.good, theme.status.critical, theme.textSecondary)

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out?',
      'Your data is saved to your account and will be waiting when you sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void signOut()
          },
        },
      ]
    )
  }

  const confirmDelete = (title: string, message: string, onConfirm: () => void) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ])
  }

  return (
    <Screen title="Profile" subtitle="Your details, measurements and saved items">
      {/* ---------------------------------------------------------- identity */}
      <Surface style={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <IconBadge size={56}>
            <UserIcon size={26} color={theme.brandText} />
          </IconBadge>
          <View style={{ flex: 1, gap: 2 }}>
            <SectionTitle>{profile.name || 'Your name'}</SectionTitle>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: spacing.xs,
              }}
            >
              <StatValue size={14}>{profile.age}</StatValue>
              <Body size={13} tone="secondary">
                yrs
              </Body>
              <Body size={13} tone="muted">
                ·
              </Body>
              <Body size={13} tone="secondary">
                {GENDER_OPTIONS.find(g => g.value === profile.gender)?.label ?? profile.gender}
              </Body>
              <Body size={13} tone="muted">
                ·
              </Body>
              {profile.heightUnit === 'cm' ? (
                <>
                  <StatValue size={14}>{profile.heightCm}</StatValue>
                  <Body size={13} tone="secondary">
                    cm
                  </Body>
                </>
              ) : (
                <StatValue size={14}>{cmToFeetInches(profile.heightCm)}</StatValue>
              )}
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Tile label={`Weight (${profile.weightUnit})`}>
            {hasWeight ? (
              <StatValue size={24}>{displayWeight}</StatValue>
            ) : (
              <Body size={13} tone="muted">
                Not set
              </Body>
            )}
          </Tile>
          <Tile label="BMI">
            {bmi === null ? (
              <Body size={13} tone="muted">
                Not set
              </Body>
            ) : (
              <StatValue size={24} color={bmiColor}>
                {bmi}
              </StatValue>
            )}
          </Tile>
          <Tile label="Day streak">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Flame size={16} color={theme.brandText} />
              <StatValue size={24}>{streak.current}</StatValue>
            </View>
          </Tile>
        </View>

        {bmi === null ? (
          <Body size={13} tone="secondary">
            Add your height and log a weigh-in to see your BMI.
          </Body>
        ) : (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.sm,
            }}
          >
            <BmiIcon size={15} color={bmiColor} />
            <Body size={13} weight="semibold" style={{ color: bmiColor }}>
              {bmiCategory}
            </Body>
          </View>
        )}

        {streak.longest > 0 ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pill>
              <Body size={12} tone="secondary">
                Longest streak
              </Body>
              <StatValue size={13}>{streak.longest}</StatValue>
              <Body size={12} tone="secondary">
                days
              </Body>
            </Pill>
          </View>
        ) : null}
      </Surface>

      {/* ---------------------------------------------------------- details */}
      <Card
        title="Your details"
        icon={<Target size={18} color={theme.brandText} />}
        collapsible
        initiallyOpen
      >
        <Field
          label="Name"
          accessibilityLabel="Name"
          value={nameDraft}
          onChangeText={setNameDraft}
          onBlur={commitName}
          placeholder="Your name"
          autoCapitalize="words"
          returnKeyType="done"
        />

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <HalfField>
            <Field
              label="Age"
              accessibilityLabel="Age in years"
              numeric
              value={ageDraft}
              onChangeText={setAgeDraft}
              onBlur={commitAge}
              keyboardType="number-pad"
              maxLength={3}
            />
          </HalfField>
          <HalfField>
            {profile.heightUnit === 'cm' ? (
              <Field
                label="Height (cm)"
                accessibilityLabel="Height in centimetres"
                numeric
                value={cmDraft}
                onChangeText={setCmDraft}
                onBlur={commitCm}
                keyboardType="number-pad"
                maxLength={3}
              />
            ) : (
              <View style={{ gap: 6 }}>
                <Label>Height (ft / in)</Label>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <HalfField>
                    <Field
                      numeric
                      value={feetDraft}
                      onChangeText={setFeetDraft}
                      onBlur={commitFeetInches}
                      keyboardType="number-pad"
                      maxLength={1}
                      accessibilityLabel="Height, feet"
                    />
                  </HalfField>
                  <HalfField>
                    <Field
                      numeric
                      value={inchesDraft}
                      onChangeText={setInchesDraft}
                      onBlur={commitFeetInches}
                      keyboardType="number-pad"
                      maxLength={2}
                      accessibilityLabel="Height, inches"
                    />
                  </HalfField>
                </View>
              </View>
            )}
          </HalfField>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Label>Gender</Label>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {GENDER_OPTIONS.map(option => (
              <Choice
                key={option.value}
                label={option.label}
                a11yLabel={`Gender: ${option.label.toLowerCase()}`}
                selected={profile.gender === option.value}
                onPress={() => saveProfile({ gender: option.value })}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Label>Goal</Label>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {GOAL_OPTIONS.map(option => (
              <Choice
                key={option.value}
                label={option.label}
                a11yLabel={option.spoken}
                selected={profile.goal === option.value}
                onPress={() => saveProfile({ goal: option.value })}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Label>Activity level</Label>
          <View style={{ gap: spacing.sm }}>
            {ACTIVITY_OPTIONS.map(option => (
              <OptionRow
                key={option.value}
                label={option.label}
                hint={option.hint}
                selected={profile.activityLevel === option.value}
                onPress={() => saveProfile({ activityLevel: option.value })}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Label>Weight unit</Label>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {WEIGHT_UNITS.map(unit => (
                  <Choice
                    key={unit.value}
                    label={unit.value}
                    a11yLabel={unit.spoken}
                    selected={profile.weightUnit === unit.value}
                    onPress={() => saveProfile({ weightUnit: unit.value })}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
            </View>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <Label>Height unit</Label>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {HEIGHT_UNITS.map(unit => (
                  <Choice
                    key={unit.value}
                    label={unit.value}
                    a11yLabel={unit.spoken}
                    selected={profile.heightUnit === unit.value}
                    onPress={() => saveProfile({ heightUnit: unit.value })}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
            </View>
          </View>
          <Body size={12} tone="muted">
            Display only. Your weight is stored in kilograms and your height in centimetres,
            so switching units never changes what was recorded.
          </Body>
        </View>

        {details.notice ? <NoticeLine notice={details.notice} /> : null}
      </Card>

      {/* ---------------------------------------------------------- weight log */}
      <Card
        title="Weight log"
        icon={<Scale size={18} color={theme.brandText} />}
        badge={weightLog.length > 0 ? <CountPill value={weightLog.length} noun="logged" /> : undefined}
        collapsible
        initiallyOpen={false}
      >
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <HalfField>
            <Field
              label={`Weight (${profile.weightUnit})`}
              accessibilityLabel={`Weight in ${profile.weightUnit === 'kg' ? 'kilograms' : 'pounds'}`}
              numeric
              value={weightDraft}
              onChangeText={setWeightDraft}
              placeholder="0"
              keyboardType="decimal-pad"
              maxLength={6}
            />
          </HalfField>
          <HalfField>
            <Field
              label="Body fat % (optional)"
              accessibilityLabel="Body fat percentage, optional"
              numeric
              value={bodyFatDraft}
              onChangeText={setBodyFatDraft}
              placeholder="—"
              keyboardType="decimal-pad"
              maxLength={4}
            />
          </HalfField>
        </View>

        <Button
          label="Log weigh-in"
          onPress={logWeight}
          icon={<Plus size={18} color={theme.brandOn} />}
          full
          haptic
        />

        {weighIn.notice ? <NoticeLine notice={weighIn.notice} /> : null}

        {weightLog.length === 0 ? (
          <EmptyState
            icon={<Scale size={22} color={theme.textMuted} />}
            title="No weigh-ins yet"
            message="Weigh in at the same time of day each time — first thing, after the bathroom — and the trend line stops arguing with itself."
          />
        ) : (
          <View>
            {/* WeightEntry.weight is stored in the unit that was selected when it was
                typed (shared type), so say so rather than silently relabel old rows.
                currentWeightKg — the figure everything else is derived from — is kg. */}
            <Body size={12} tone="muted" style={{ paddingBottom: spacing.sm }}>
              Past weigh-ins keep the number you typed; switching units does not convert them.
            </Body>
            {weightLog.slice(0, 20).map(entry => (
              <Row key={entry.id}>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                    <StatValue size={18}>{entry.weight}</StatValue>
                    <Body size={12} tone="secondary">
                      {profile.weightUnit}
                    </Body>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
                    <Body size={12} tone="muted">
                      {formatDate(entry.date)}
                    </Body>
                    {isPositive(entry.bodyFat) ? (
                      <Metric label="body fat" value={entry.bodyFat} unit="%" />
                    ) : null}
                  </View>
                </View>
                <IconButton
                  accessibilityLabel={`Delete weigh-in from ${formatDate(entry.date)}`}
                  onPress={() => removeWeightEntry(entry.id)}
                >
                  <Trash2 size={18} color={theme.textMuted} />
                </IconButton>
              </Row>
            ))}
            {weightLog.length > 20 ? (
              <Body size={12} tone="muted" style={{ paddingTop: spacing.md }}>
                Showing the 20 most recent of {weightLog.length}.
              </Body>
            ) : null}
          </View>
        )}
      </Card>

      {/* ---------------------------------------------------------- body */}
      <Card
        title="Body measurements"
        icon={<Ruler size={18} color={theme.brandText} />}
        badge={
          bodyMeasurements.length > 0 ? (
            <CountPill value={bodyMeasurements.length} noun="logged" />
          ) : undefined
        }
        collapsible
        initiallyOpen={false}
      >
        {/* Body-fat estimate — a real number when the tape data supports it, and a
            specific instruction when it does not. */}
        <View
          style={{
            gap: spacing.sm,
            padding: spacing.md,
            borderRadius: radius.control,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: theme.border,
            backgroundColor: theme.canvas,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Activity size={16} color={theme.textMuted} />
            <Label>Body fat estimate</Label>
          </View>

          {composition ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                  <StatValue size={30}>{composition.bodyFatPct}</StatValue>
                  <Body size={14} tone="secondary">
                    %
                  </Body>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
                  <Body size={12} tone="muted">
                    lean mass
                  </Body>
                  <StatValue size={18}>{leanMassDisplay}</StatValue>
                  <Body size={12} tone="secondary">
                    {profile.weightUnit}
                  </Body>
                </View>
              </View>
              <Body size={12} tone="muted">
                US Navy tape method, from your measurements on {formatDate(composition.measuredOn)}.
              </Body>
            </>
          ) : (
            <Body size={13} tone="secondary">
              {compositionHint}
            </Body>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Label>New measurement (cm)</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {MEASUREMENT_FIELDS.map(field => (
              <View key={field.key} style={{ width: '47%' }}>
                <Field
                  label={field.label}
                  accessibilityLabel={`${field.label} in centimetres`}
                  numeric
                  value={tapeDraft[field.key] ?? ''}
                  onChangeText={text => setTapeDraft(prev => ({ ...prev, [field.key]: text }))}
                  placeholder="—"
                  keyboardType="decimal-pad"
                  maxLength={5}
                />
              </View>
            ))}
          </View>
        </View>

        <Button
          label="Save measurements"
          onPress={saveMeasurements}
          icon={<Plus size={18} color={theme.brandOn} />}
          full
          haptic
        />

        {tape.notice ? <NoticeLine notice={tape.notice} /> : null}

        {measurementsByDate.length === 0 ? (
          <EmptyState
            icon={<Ruler size={22} color={theme.textMuted} />}
            title="No measurements yet"
            message="Tape catches what the scale misses — a waist that drops while weight holds is muscle you kept."
          />
        ) : (
          <View>
            {measurementsByDate.slice(0, 10).map((measurement, index) => (
              <Row key={measurement.id} first={index === 0}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Body size={12} tone="muted">
                    {formatDate(measurement.date)}
                  </Body>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                    {MEASUREMENT_FIELDS.map(field =>
                      isPositive(measurement[field.key]) ? (
                        <Metric
                          key={field.key}
                          label={field.label}
                          value={measurement[field.key] as number}
                          unit="cm"
                        />
                      ) : null
                    )}
                  </View>
                </View>
                <IconButton
                  accessibilityLabel={`Delete measurements from ${formatDate(measurement.date)}`}
                  onPress={() => removeBodyMeasurement(measurement.id)}
                >
                  <Trash2 size={18} color={theme.textMuted} />
                </IconButton>
              </Row>
            ))}
            {measurementsByDate.length > 10 ? (
              <Body size={12} tone="muted" style={{ paddingTop: spacing.md }}>
                Showing the 10 most recent of {measurementsByDate.length}.
              </Body>
            ) : null}
          </View>
        )}
      </Card>

      {/* ---------------------------------------------------------- custom foods */}
      <Card
        title="Custom foods"
        icon={<Utensils size={18} color={theme.brandText} />}
        badge={customFoods.length > 0 ? <CountPill value={customFoods.length} noun="saved" /> : undefined}
        collapsible
        initiallyOpen={false}
      >
        {customFoods.length === 0 ? (
          <EmptyState
            icon={<Utensils size={22} color={theme.textMuted} />}
            title="No custom foods yet"
            message="Save the things no database gets right — your shake, your mum's curry — from the food search, then log them in one tap."
          />
        ) : (
          <View>
            {customFoods.map((food, index) => (
              <Row key={food.id} first={index === 0}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Body weight="semibold" numberOfLines={1}>
                    {food.name}
                  </Body>
                  <Body size={11} tone="muted" numberOfLines={1}>
                    {food.brand ? `${food.brand} · ` : ''}
                    {food.servingSize} {food.servingUnit}
                  </Body>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                    <Metric label="kcal" value={food.calories} />
                    <Metric label="P" value={food.protein} unit="g" color={theme.macro.protein} />
                    <Metric label="C" value={food.carbs} unit="g" color={theme.macro.carbs} />
                    <Metric label="F" value={food.fat} unit="g" color={theme.macro.fat} />
                  </View>
                </View>
                <IconButton
                  accessibilityLabel={`Delete custom food ${food.name}`}
                  onPress={() =>
                    confirmDelete(
                      'Delete this food?',
                      `"${food.name}" is removed from your saved foods. Meals you already logged with it are not affected.`,
                      () => removeCustomFood(food.id)
                    )
                  }
                >
                  <Trash2 size={18} color={theme.textMuted} />
                </IconButton>
              </Row>
            ))}
          </View>
        )}
      </Card>

      {/* ---------------------------------------------------------- templates */}
      <Card
        title="Meal templates"
        icon={<Bookmark size={18} color={theme.brandText} />}
        badge={
          mealTemplates.length > 0 ? <CountPill value={mealTemplates.length} noun="saved" /> : undefined
        }
        collapsible
        initiallyOpen={false}
      >
        {mealTemplates.length === 0 ? (
          <EmptyState
            icon={<Bookmark size={22} color={theme.textMuted} />}
            title="No meal templates yet"
            message="Build a meal you eat often in the diary, then save it as a template. It comes back as a one-tap add."
          />
        ) : (
          <View>
            {mealTemplates.map((template, index) => (
              <Row key={template.id} first={index === 0}>
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Body weight="semibold" numberOfLines={1}>
                    {template.name}
                  </Body>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                    <Metric
                      label={template.entries.length === 1 ? 'item' : 'items'}
                      value={template.entries.length}
                    />
                    <Metric label="kcal" value={templateCalories(template)} />
                  </View>
                </View>
                <IconButton
                  accessibilityLabel={`Delete template ${template.name}`}
                  onPress={() =>
                    confirmDelete(
                      'Delete this template?',
                      `"${template.name}" is removed. Meals you already logged from it stay in your diary.`,
                      () => deleteMealTemplate(template.id)
                    )
                  }
                >
                  <Trash2 size={18} color={theme.textMuted} />
                </IconButton>
              </Row>
            ))}
          </View>
        )}
      </Card>

      {/* ---------------------------------------------------------- appearance */}
      <Card title="Appearance" icon={<Moon size={18} color={theme.brandText} />}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            minHeight: HIT_SIZE,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Body weight="semibold">Dark mode</Body>
            <Body size={12} tone="muted">
              Follows your account across devices rather than the system setting.
            </Body>
          </View>
          <Switch
            value={darkMode}
            onValueChange={toggleDarkMode}
            accessibilityRole="switch"
            accessibilityLabel="Dark mode"
            accessibilityState={{ checked: darkMode }}
            trackColor={{ false: theme.border, true: theme.brand }}
            thumbColor={theme.brandOn}
          />
        </View>
      </Card>

      {/* ---------------------------------------------------------- account */}
      <Card title="Account" icon={<Cloud size={18} color={theme.brandText} />}>
        <View style={{ gap: spacing.xs }}>
          <Label>Signed in as</Label>
          <Body weight="medium" numberOfLines={1}>
            {user?.email ?? 'Not signed in'}
          </Body>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <sync.Icon size={16} color={sync.color} />
          <Body size={13} weight="medium" style={{ color: sync.color, flex: 1 }}>
            {sync.text}
          </Body>
        </View>

        {user ? (
          <Button
            label="Sign out"
            variant="secondary"
            onPress={confirmSignOut}
            icon={<LogOut size={18} color={theme.text} />}
            full
          />
        ) : (
          <Button
            label="Sign in"
            onPress={() => router.push('/login')}
            icon={<LogIn size={18} color={theme.brandOn} />}
            full
          />
        )}
      </Card>
    </Screen>
  )
}

/**
 * Sync state as an icon, words and a colour — never colour alone, and never a claim the
 * app cannot back up (a signed-out device says so plainly).
 */
function syncStatusMeta(
  status: SyncStatus,
  signedIn: boolean,
  good: string,
  critical: string,
  neutral: string
): { Icon: React.ComponentType<{ size: number; color: string }>; text: string; color: string } {
  if (!signedIn) {
    return {
      Icon: CloudOff,
      text: 'Not signed in — this data stays on this device only',
      color: neutral,
    }
  }
  if (status === 'saving') return { Icon: RefreshCw, text: 'Saving changes…', color: neutral }
  if (status === 'saved') return { Icon: CheckCircle2, text: 'Saved to your account', color: good }
  if (status === 'error') {
    return {
      Icon: AlertCircle,
      text: 'Sync failed — your changes are still safe on this device',
      color: critical,
    }
  }
  return { Icon: Cloud, text: 'Changes sync automatically', color: neutral }
}
