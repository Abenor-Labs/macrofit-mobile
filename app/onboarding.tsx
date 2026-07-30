import React, { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Activity,
  ArrowLeft,
  Check,
  Flame,
  NotebookPen,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react-native'

import { useStore } from '@/store/useStore'
import { useHealthSync } from '@/hooks/useHealthSync'
import { hasPermissions, readWeightHistory } from '@/lib/healthConnect'
import { useTheme } from '@/theme/useTheme'
import { Backdrop } from '@/components/Backdrop'
import { GlassSurface } from '@/components/Glass'
import { Body, Label, SectionTitle } from '@/components/Text'
import { Button } from '@/components/Button'
import { Field } from '@/components/Layout'
import { HIT_SIZE, jade, radius, spacing } from '@/theme/tokens'
import {
  ACTIVITY_CHOICES,
  GOAL_CHOICES,
  answersToProfile,
  cmFromFeetInches,
  describeHorizon,
  defaultPaceFor,
  feetInchesFromCm,
  kgFromLbs,
  lbsFromKg,
  pacesFor,
  validateBasics,
  validateTarget,
  weeksToTarget,
  caloriesForPace,
} from '@/core/utils/onboarding'
import { calculateBMR, calculateMacroGoals, calculateTDEE } from '@/core/utils/calculations'
import type { ActivityLevel, UserProfile, WeightGoal } from '@/core/types'

/**
 * The flow, by name rather than by index.
 *
 * 'Your phone' only exists where Health Connect does, so the sequence differs by platform
 * and the step numbers are not stable. Every branch below switches on the name; comparing
 * `step === 1` would mean something different on Android than on iOS, which is the kind of
 * bug that only shows up on one device.
 */
type StepName = 'Welcome' | 'Your phone' | 'About you' | 'Your days' | 'Your goal' | 'Your plan'

const BASE_STEPS: StepName[] = ['Welcome', 'About you', 'Your days', 'Your goal', 'Your plan']

/** A full-width tappable option. The row is the target, not a small radio dot. */
const OptionRow: React.FC<{
  label: string
  detail?: string
  selected: boolean
  onSelect: () => void
}> = ({ label, detail, selected, onSelect }) => {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.control,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: selected ? theme.status.good : theme.border,
        backgroundColor: selected ? `${theme.status.good}14` : theme.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          marginTop: 2,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: selected ? theme.status.good : theme.border,
          backgroundColor: selected ? theme.status.good : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Check size={12} color={theme.canvas} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body weight="semibold" style={{ color: selected ? theme.status.good : theme.text }}>
          {label}
        </Body>
        {detail ? (
          <Body size={13} tone="secondary">
            {detail}
          </Body>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Compact two-value switch that sits beside the field it governs. */
const UnitToggle = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (next: T) => void
}) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        padding: 2,
        borderRadius: radius.pill,
        backgroundColor: theme.border,
      }}
    >
      {options.map(o => {
        const active = o.value === value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: active ? theme.surface : 'transparent',
            }}
          >
            <Body size={12} weight="semibold" tone={active ? 'primary' : 'muted'}>
              {o.label}
            </Body>
          </Pressable>
        )
      })}
    </View>
  )
}

const FieldHeader: React.FC<{ label: string; right?: React.ReactNode }> = ({ label, right }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    }}
  >
    <Label>{label}</Label>
    {right}
  </View>
)

/**
 * First-run setup.
 *
 * Mirrors the website's flow question for question — same wording, same order, same
 * validation — because the two share one account. Someone who sets up on their phone and
 * later opens the site should recognise what they answered.
 */
export default function OnboardingScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const profile = useStore(s => s.profile)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const goals = useStore(s => s.goals)
  const updateProfile = useStore(s => s.updateProfile)
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const updateGoals = useStore(s => s.updateGoals)
  const completeOnboarding = useStore(s => s.completeOnboarding)

  const health = useHealthSync()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  /** What Health Connect actually had. Null until the step has run; set even when empty. */
  const [imported, setImported] = useState<{ height: boolean; weight: boolean; weighIns: number } | null>(null)

  /*
    Built from availability, which is 'unavailable' until the probe in useHealthSync returns.
    The step therefore appears a beat after mount — acceptable because it can only appear
    while the user is still reading the Welcome screen, never underneath them mid-flow.
  */
  const STEPS: StepName[] = useMemo(
    () =>
      health.availability === 'available'
        ? ['Welcome', 'Your phone', 'About you', 'Your days', 'Your goal', 'Your plan']
        : BASE_STEPS,
    [health.availability]
  )

  const current: StepName = STEPS[Math.min(step, STEPS.length - 1)]

  const [name, setName] = useState('')
  const [gender, setGender] = useState<UserProfile['gender']>(profile.gender)
  const [age, setAge] = useState('')
  const [heightUnit, setHeightUnit] = useState<UserProfile['heightUnit']>(profile.heightUnit)
  const [heightCmText, setHeightCmText] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weightUnit, setWeightUnit] = useState<UserProfile['weightUnit']>(profile.weightUnit)
  const [weightText, setWeightText] = useState('')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('lightly_active')
  const [goal, setGoal] = useState<WeightGoal>('lose')
  const [pace, setPace] = useState<number | undefined>(defaultPaceFor('lose'))
  const [targetText, setTargetText] = useState('')

  const num = (text: string): number => Number.parseFloat(text.replace(',', '.'))

  const heightCm =
    heightUnit === 'cm' ? num(heightCmText) : cmFromFeetInches(num(heightFt) || 0, num(heightIn) || 0)
  const weightKg = weightUnit === 'kg' ? num(weightText) : kgFromLbs(num(weightText))
  const targetKg =
    targetText.trim() === ''
      ? undefined
      : weightUnit === 'kg'
        ? num(targetText)
        : kgFromLbs(num(targetText))

  /** Switching units rewrites the field so the number on screen stays the same body. */
  const switchWeightUnit = (next: UserProfile['weightUnit']) => {
    if (next === weightUnit) return
    const convert = (text: string): string => {
      const value = num(text)
      if (!Number.isFinite(value)) return text
      return String(Math.round((next === 'kg' ? kgFromLbs(value) : lbsFromKg(value)) * 10) / 10)
    }
    setWeightText(convert(weightText))
    if (targetText.trim() !== '') setTargetText(convert(targetText))
    setWeightUnit(next)
  }

  const switchHeightUnit = (next: UserProfile['heightUnit']) => {
    if (next === heightUnit) return
    if (next === 'ft') {
      const cm = num(heightCmText)
      if (Number.isFinite(cm)) {
        const { feet, inches } = feetInchesFromCm(cm)
        setHeightFt(String(feet))
        setHeightIn(String(inches))
      }
    } else {
      const cm = cmFromFeetInches(num(heightFt) || 0, num(heightIn) || 0)
      if (cm > 0) setHeightCmText(String(Math.round(cm)))
    }
    setHeightUnit(next)
  }

  const answers = {
    name,
    gender,
    age: num(age),
    heightCm,
    weightKg,
    weightUnit,
    heightUnit,
    activityLevel,
    goal,
    paceKgPerWeek: pace,
    targetWeightKg: targetKg,
  }

  // Runs the same functions the store runs on save, so the last step promises exactly
  // what lands in the app.
  const plan = useMemo(() => {
    const preview = { ...profile, ...answersToProfile(answers) } as UserProfile
    const kg = Number.isFinite(weightKg) ? weightKg : currentWeightKg
    const tdee = calculateTDEE(calculateBMR(preview, kg), activityLevel)
    const calories = caloriesForPace(tdee, goal, pace)
    const macros = calculateMacroGoals(calories, goals.proteinPct, goals.carbsPct, goals.fatPct, kg)
    return { tdee: Math.round(tdee), ...macros }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightKg, heightCm, age, gender, activityLevel, goal, pace, targetKg])

  const horizon = describeHorizon(weeksToTarget(weightKg, targetKg, pace))

  const validateStep = (name: StepName): string | null => {
    if (name === 'About you') return validateBasics({ age: num(age), heightCm, weightKg })
    if (name === 'Your goal') return validateTarget(goal, weightKg, targetKg)
    return null
  }

  /**
   * Pull height, weight and a year of weigh-ins off the phone.
   *
   * The fields are prefilled rather than committed, so a stale reading can be typed over
   * before it becomes anyone's profile. The weigh-in history is the real prize: the
   * weight-goal card needs ten days of spread before it stops guessing, and someone with
   * scale history gets their measured trend on day one instead of in a fortnight.
   */
  const pullFromPhone = async () => {
    setError(null)
    if (!health.granted) {
      await health.connect()
      // connect() resolves after the permission sheet closes; a refusal is not an error to
      // report, it is an answer. The step stays put and Skip is still right there.
      if (!(await hasPermissions())) return
    }

    const basics = await health.readBasics()
    if (basics.heightCm !== null) {
      setHeightUnit('cm')
      setHeightCmText(String(basics.heightCm))
    }
    if (basics.weightKg !== null) {
      setWeightUnit('kg')
      setWeightText(String(basics.weightKg))
    }

    /*
      Counted here, written in finish(). WeightEntry.weight is stored in the profile's
      DISPLAY unit, and the profile does not have its final unit yet — the user can still
      switch to pounds on the very next screen. Importing now would write kilogram numbers
      that are later read back as pounds, silently turning 70.6 kg into 70.6 lb across
      every trend, TDEE estimate and goal calculation downstream.
    */
    const history = await readWeightHistory(profile)
    const existing = new Set(useStore.getState().weightLog.map(entry => entry.date))

    setImported({
      height: basics.heightCm !== null,
      weight: basics.weightKg !== null,
      weighIns: history.filter(entry => !existing.has(entry.date)).length,
    })
  }

  const finish = () => {
    // Profile first: addWeightEntry reads weightUnit off the profile to decide what the
    // number it is handed means.
    const patch = answersToProfile(answers)
    updateProfile(patch)
    const shown = weightUnit === 'kg' ? weightKg : lbsFromKg(weightKg)
    addWeightEntry({
      date: new Date().toISOString().slice(0, 10),
      weight: Math.round(shown * 10) / 10,
    })

    /*
      The imported history lands here rather than on the step that offered it, because only
      now is the unit settled — see pullFromPhone. Read against the merged profile, not the
      store's copy: updateProfile has been called but this closure still holds the old one,
      and useHealthSync's own importer closes over the same stale value.

      Fire and forget. It is an enhancement to a screen the user is already leaving, and
      making them wait on a Health Connect read to reach their dashboard would trade the
      friction we just removed for a different one.
    */
    if (imported !== null && imported.weighIns > 0) {
      const merged = { ...profile, ...patch } as UserProfile
      void (async () => {
        const history = await readWeightHistory(merged)
        // Days the user logged themselves always win over a device reading.
        const existing = new Set(useStore.getState().weightLog.map(entry => entry.date))
        for (const entry of history) if (!existing.has(entry.date)) addWeightEntry(entry)
      })()
    }
    // Not recalculateGoals(): that applies the shared flat +/-500 and would overwrite the
    // pace-derived target the last step just showed.
    updateGoals({ calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat })
    completeOnboarding()
    router.replace('/(tabs)')
  }

  const next = () => {
    const problem = validateStep(current)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  const back = () => {
    setError(null)
    setStep(s => Math.max(0, s - 1))
  }

  const changeGoal = (nextGoal: WeightGoal) => {
    setGoal(nextGoal)
    setPace(defaultPaceFor(nextGoal))
    setError(null)
  }

  const macroRow = [
    { label: 'Protein', value: plan.protein, color: theme.macro.protein },
    { label: 'Carbs', value: plan.carbs, color: theme.macro.carbs },
    { label: 'Fat', value: plan.fat, color: theme.macro.fat },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <Backdrop />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Progress: filled segments, and only the current stop is named. Naming all
              five turns a one-minute task into a list of chores. */}
          <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Label style={{ color: theme.status.good }}>{current}</Label>
              <Label>
                {step + 1} of {STEPS.length}
              </Label>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {STEPS.map((label, i) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: radius.pill,
                    backgroundColor: i <= step ? theme.status.good : theme.trackMuted,
                  }}
                />
              ))}
            </View>
          </View>

          <GlassSurface style={{ padding: spacing.lg, gap: spacing.lg }}>
            {current === 'Welcome' ? (
              <View style={{ gap: spacing.lg }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.control,
                    backgroundColor: jade[600],
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={28} color="#FFFFFF" />
                </View>
                <View style={{ gap: spacing.sm }}>
                  <SectionTitle style={{ fontSize: 24 }}>Let&apos;s set up your targets</SectionTitle>
                  <Body tone="secondary">
                    Five short questions. We work out what your body burns in a day, then turn that
                    into a calorie and protein target you can actually hit.
                  </Body>
                </View>
                <View style={{ gap: spacing.md }}>
                  {[
                    { Icon: NotebookPen, text: 'Log meals by searching, snapping a photo or just typing what you ate.' },
                    { Icon: TrendingUp, text: 'Weigh in whenever you like — we read the trend, not the daily noise.' },
                    { Icon: Target, text: 'Targets adjust as your weight moves, so they stay honest.' },
                  ].map(({ Icon, text }) => (
                    <View key={text} style={{ flexDirection: 'row', gap: spacing.md }}>
                      <View
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: radius.tight,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: `${theme.status.good}1F`,
                        }}
                      >
                        <Icon size={15} color={theme.status.good} />
                      </View>
                      <Body size={14} tone="secondary" style={{ flex: 1 }}>
                        {text}
                      </Body>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {current === 'Your phone' ? (
              <View style={{ gap: spacing.lg }}>
                <View style={{ gap: spacing.sm }}>
                  <SectionTitle style={{ fontSize: 22 }}>
                    Your phone already knows some of this
                  </SectionTitle>
                  <Body size={14} tone="secondary">
                    Health Connect can hand over your height, your weight, and any weigh-ins
                    already recorded by a scale or another app. We still have to ask your age
                    and sex on the next screen — Health Connect does not store either, and the
                    calorie formula needs both.
                  </Body>
                </View>

                {imported === null ? (
                  <Body size={13} tone="muted">
                    Nothing is written until you press on, and anything that comes across can be
                    typed over.
                  </Body>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    {/*
                      Reports what was found, including nothing. "Connected" alone would leave
                      someone with no records on file wondering what it actually did.
                    */}
                    {[
                      imported.height ? 'Height filled in' : 'No height on file — we will ask',
                      imported.weight ? 'Weight filled in' : 'No weight on file — we will ask',
                      imported.weighIns > 0
                        ? `${imported.weighIns} past weigh-in${imported.weighIns === 1 ? '' : 's'} ready to bring across — your weight trend will work from day one`
                        : 'No past weigh-ins found',
                    ].map(line => (
                      <View
                        key={line}
                        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}
                      >
                        <Check size={16} color={theme.status.good} strokeWidth={2.4} />
                        <Body size={13} tone="secondary" style={{ flex: 1 }}>
                          {line}
                        </Body>
                      </View>
                    ))}
                  </View>
                )}

                {imported === null && (
                  <Button
                    label="Bring in my details"
                    full
                    loading={health.busy}
                    onPress={() => void pullFromPhone()}
                    icon={<Activity size={16} color={theme.brandOn} strokeWidth={2.2} />}
                  />
                )}
              </View>
            ) : null}

            {current === 'About you' ? (
              <View style={{ gap: spacing.lg }}>
                <Body size={14} tone="secondary">
                  These four numbers set every target in the app. Nothing here is shared with anyone.
                </Body>

                <Field
                  label="What should we call you?"
                  value={name}
                  onChangeText={setName}
                  placeholder="Optional"
                  autoCapitalize="words"
                />

                <View style={{ gap: 6 }}>
                  <Label>Sex used for the calculation</Label>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    {(['male', 'female', 'other'] as const).map(g => (
                      <Pressable
                        key={g}
                        onPress={() => setGender(g)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: gender === g }}
                        style={{
                          flex: 1,
                          minHeight: HIT_SIZE,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: radius.control,
                          borderWidth: StyleSheet.hairlineWidth * 2,
                          borderColor: gender === g ? theme.status.good : theme.border,
                          backgroundColor: gender === g ? `${theme.status.good}14` : theme.surface,
                        }}
                      >
                        <Body
                          size={14}
                          weight="semibold"
                          style={{
                            textTransform: 'capitalize',
                            color: gender === g ? theme.status.good : theme.textSecondary,
                          }}
                        >
                          {g}
                        </Body>
                      </Pressable>
                    ))}
                  </View>
                  <Body size={12} tone="muted">
                    Body-fat and calorie formulas differ by sex. &ldquo;Other&rdquo; uses the average of both.
                  </Body>
                </View>

                <Field
                  label="Age"
                  value={age}
                  onChangeText={setAge}
                  keyboardType="number-pad"
                  placeholder="e.g. 28"
                  numeric
                />

                <View style={{ gap: 6 }}>
                  <FieldHeader
                    label="Height"
                    right={
                      <UnitToggle
                        value={heightUnit}
                        onChange={switchHeightUnit}
                        options={[
                          { value: 'cm', label: 'cm' },
                          { value: 'ft', label: 'ft / in' },
                        ]}
                      />
                    }
                  />
                  {heightUnit === 'cm' ? (
                    <Field
                      value={heightCmText}
                      onChangeText={setHeightCmText}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 175"
                      numeric
                    />
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Field
                        value={heightFt}
                        onChangeText={setHeightFt}
                        keyboardType="number-pad"
                        placeholder="feet"
                        numeric
                        style={{ flex: 1 }}
                      />
                      <Field
                        value={heightIn}
                        onChangeText={setHeightIn}
                        keyboardType="number-pad"
                        placeholder="inches"
                        numeric
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                </View>

                <View style={{ gap: 6 }}>
                  <FieldHeader
                    label="Weight today"
                    right={
                      <UnitToggle
                        value={weightUnit}
                        onChange={switchWeightUnit}
                        options={[
                          { value: 'kg', label: 'kg' },
                          { value: 'lbs', label: 'lbs' },
                        ]}
                      />
                    }
                  />
                  <Field
                    value={weightText}
                    onChangeText={setWeightText}
                    keyboardType="decimal-pad"
                    placeholder={weightUnit === 'kg' ? 'e.g. 72.5' : 'e.g. 160'}
                    numeric
                  />
                  <Body size={12} tone="muted">
                    Rough is fine. This becomes your first weigh-in.
                  </Body>
                </View>
              </View>
            ) : null}

            {current === 'Your days' ? (
              <View style={{ gap: spacing.md }}>
                <Body size={14} tone="secondary">
                  Pick the line closest to a normal week — not your best one. Overshooting here is the
                  most common reason a target ends up too high.
                </Body>
                {ACTIVITY_CHOICES.map(c => (
                  <OptionRow
                    key={c.value}
                    label={c.label}
                    detail={c.detail}
                    selected={activityLevel === c.value}
                    onSelect={() => setActivityLevel(c.value)}
                  />
                ))}
              </View>
            ) : null}

            {current === 'Your goal' ? (
              <View style={{ gap: spacing.md }}>
                {GOAL_CHOICES.map(c => (
                  <OptionRow
                    key={c.value}
                    label={c.label}
                    detail={c.detail}
                    selected={goal === c.value}
                    onSelect={() => changeGoal(c.value)}
                  />
                ))}

                {goal !== 'maintain' ? (
                  <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
                    <Label>How fast?</Label>
                    {pacesFor(goal).map(p => (
                      <OptionRow
                        key={p.kgPerWeek}
                        label={`${p.label} — ${
                          weightUnit === 'kg'
                            ? `${p.kgPerWeek} kg`
                            : `${Math.round(lbsFromKg(p.kgPerWeek) * 10) / 10} lbs`
                        } a week`}
                        detail={p.detail}
                        selected={pace === p.kgPerWeek}
                        onSelect={() => setPace(p.kgPerWeek)}
                      />
                    ))}

                    <View style={{ gap: 6 }}>
                      <Label>{`Goal weight (${weightUnit})`}</Label>
                      <Field
                        value={targetText}
                        onChangeText={setTargetText}
                        keyboardType="decimal-pad"
                        placeholder="Optional — you can set this later"
                        numeric
                      />
                      {horizon ? (
                        <Body size={12} weight="semibold" style={{ color: theme.status.good }}>
                          {horizon}
                        </Body>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {current === 'Your plan' ? (
              <View style={{ gap: spacing.lg }}>
                <View style={{ gap: spacing.sm }}>
                  <SectionTitle style={{ fontSize: 21 }}>Here&apos;s your daily target</SectionTitle>
                  <Body size={14} tone="secondary">
                    {`You burn roughly ${plan.tdee} kcal a day. `}
                    {goal === 'lose' ? 'Eating under that is what moves the scale down.' : null}
                    {goal === 'gain' ? 'Eating over that is what gives training something to build with.' : null}
                    {goal === 'maintain' ? 'Matching it holds you steady.' : null}
                  </Body>
                </View>

                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: spacing.lg,
                    borderRadius: radius.control,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: `${theme.status.good}40`,
                    backgroundColor: `${theme.status.good}14`,
                  }}
                >
                  <Label>Eat per day</Label>
                  <Body
                    style={{
                      fontSize: 40,
                      lineHeight: 46,
                      fontVariant: ['tabular-nums'],
                      color: theme.status.good,
                    }}
                    weight="semibold"
                  >
                    {`${plan.calories} kcal`}
                  </Body>
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  {macroRow.map(m => (
                    <View
                      key={m.label}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: spacing.md,
                        borderRadius: radius.tight,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }}
                    >
                      <Body
                        weight="semibold"
                        style={{ fontSize: 20, color: m.color, fontVariant: ['tabular-nums'] }}
                      >
                        {`${m.value}g`}
                      </Body>
                      <Label>{m.label}</Label>
                    </View>
                  ))}
                </View>

                <View style={{ gap: spacing.md }}>
                  {[
                    { Icon: Flame, text: 'Nothing is locked in — every number is editable under Profile.' },
                    { Icon: Activity, text: 'Log for a couple of weeks and the coach re-checks these against your real weight trend.' },
                  ].map(({ Icon, text }) => (
                    <View key={text} style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <Icon size={15} color={theme.status.good} style={{ marginTop: 2 }} />
                      <Body size={13} tone="secondary" style={{ flex: 1 }}>
                        {text}
                      </Body>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {error ? (
              <Body size={13} style={{ color: theme.status.critical }}>
                {error}
              </Body>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {step > 0 ? (
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={back}
                  icon={<ArrowLeft size={16} color={theme.text} />}
                />
              ) : null}
              <Button
                /*
                  On 'Your phone' this reads Skip until something has actually been pulled
                  in. Labelling it Continue there would make the only way past the step look
                  like it required connecting first, which is the opposite of true.
                */
                label={
                  current === 'Welcome'
                    ? 'Get started'
                    : current === 'Your phone' && imported === null
                      ? 'Skip'
                      : step === STEPS.length - 1
                        ? 'Start tracking'
                        : 'Continue'
                }
                variant={current === 'Your phone' && imported === null ? 'secondary' : 'primary'}
                onPress={next}
                haptic={step === STEPS.length - 1}
                style={{ flex: 1 }}
              />
            </View>
          </GlassSurface>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
