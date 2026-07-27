import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Check,
  Flame,
  Info,
  Minus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from 'lucide-react-native'

import type { CoachAlert, PhaseType, TdeeEstimate } from '@core/types'
import { calculateBMR, calculateCalorieGoal, calculateTDEE } from '@core/utils/calculations'
import { useStore } from '@/store/useStore'
import { useCoach } from '@/hooks/useCoach'
import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { GlassSurface, Surface } from '@/components/Glass'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { Field, Pill, Screen } from '@/components/Layout'

/**
 * Goals & targets.
 *
 * Two halves, in this order on purpose: what the coach proposes, then what the user
 * decides. Nothing the coach produces reaches the daily targets until Accept is pressed,
 * and the manual form below always wins.
 */

/** lucide-react-native icons, typed structurally so no icon-library type has to be imported. */
type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

const PHASE_META: Record<PhaseType, { label: string; Icon: IconComponent }> = {
  cut: { label: 'Cut', Icon: TrendingDown },
  lean_bulk: { label: 'Lean bulk', Icon: TrendingUp },
  maintain: { label: 'Maintain', Icon: Minus },
  recomp: { label: 'Recomp', Icon: Repeat },
}

const BASIS_LABEL: Record<TdeeEstimate['basis'], string> = {
  mifflin: 'Mifflin-St Jeor formula',
  katch: 'Katch-McArdle, from your lean mass',
}

const CONFIDENCE_LABEL: Record<TdeeEstimate['confidence'], string> = {
  none: 'Not measured yet',
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
}

/** Qualifying days needed before intake can be turned into a measured burn. Matches tdee.ts. */
const MIN_DAYS_FOR_MEASURED = 10

/** A gap this small is noise rather than a real difference between the two burn numbers. */
const NOISE_KCAL = 50

/**
 * Thousands separators without Intl. `toLocaleString` is available on Hermes but its
 * output depends on how the engine was built; a target the user reads every day should
 * not render differently on two devices.
 */
const fmtInt = (value: number): string =>
  Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/**
 * The one plain sentence explaining predicted versus measured burn. When nothing has been
 * measured it says outright what is still missing — never a reassuring hedge over an
 * empty column.
 */
const explainTdee = (tdee: TdeeEstimate): string => {
  if (tdee.measured === null) {
    const daysShort = Math.max(0, MIN_DAYS_FOR_MEASURED - tdee.daysOfData)
    const needsWeight = tdee.weightTrendKgPerWeek === null
    const opening = `The app is still using the ${BASIS_LABEL[tdee.basis].toLowerCase()} — nothing here has been measured from your own data yet.`

    if (daysShort > 0 && needsWeight) {
      return `${opening} Log everything you eat on ${daysShort} more ${plural(daysShort, 'day', 'days')}, and weigh in at least twice across a stretch of 10 days or more.`
    }
    if (daysShort > 0) {
      return `${opening} Log everything you eat on ${daysShort} more ${plural(daysShort, 'day', 'days')} and a measured number will appear here.`
    }
    if (needsWeight) {
      return `${opening} You have ${tdee.daysOfData} fully logged ${plural(tdee.daysOfData, 'day', 'days')} — now weigh in at least twice across a stretch of 10 days or more and a measured number will appear here.`
    }
    return `${opening} Your logged intake and weight trend do not yet combine into a usable number.`
  }

  const gap = tdee.measured - tdee.predicted
  const size = Math.round(Math.abs(gap))
  const trend = tdee.weightTrendKgPerWeek
  const trendClause =
    trend === null
      ? `from ${tdee.daysOfData} logged ${plural(tdee.daysOfData, 'day', 'days')}`
      : `from ${tdee.daysOfData} logged ${plural(tdee.daysOfData, 'day', 'days')} against a weight trend of ${trend > 0 ? '+' : ''}${trend.toFixed(2)} kg a week`

  if (size < NOISE_KCAL) {
    return `Your measured burn lands within ${size} kcal of the formula ${trendClause}, so the estimate is holding up well.`
  }
  return `Your measured burn is about ${size} kcal a day ${gap > 0 ? 'higher' : 'lower'} than the formula predicts, ${trendClause}. The measured number is the better one to plan around.`
}

/** A hairline cell. Used inside glass, where a solid Surface would kill the material. */
const Cell: React.FC<{ children: React.ReactNode; theme: Theme; grow?: boolean }> = ({
  children,
  theme,
  grow = true,
}) => (
  <View
    style={{
      flex: grow ? 1 : undefined,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.border,
      padding: spacing.md,
      gap: 6,
    }}
  >
    {children}
  </View>
)

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
)

/** Label, then the figure with its unit. Every figure here is real store data. */
const FigureCell: React.FC<{
  label: string
  value: string
  unit?: string
  caption?: string
  color?: string
  dot?: string
  icon?: React.ReactNode
  theme: Theme
  muted?: boolean
  valueLabel?: string
}> = ({ label, value, unit, caption, color, dot, icon, theme, muted = false, valueLabel }) => (
  <Cell theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dot ? <Dot color={dot} /> : null}
      {icon}
      <Label>{label}</Label>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <StatValue
        size={22}
        color={color}
        tone={muted ? 'muted' : 'primary'}
        accessibilityLabel={valueLabel}
      >
        {value}
      </StatValue>
      {unit ? (
        <Body size={12} tone="muted" weight="medium">
          {unit}
        </Body>
      ) : null}
    </View>
    {caption ? (
      <Body size={11} tone="muted">
        {caption}
      </Body>
    ) : null}
  </Cell>
)

/** A neutral explanatory note. Icon carries the kind; the words carry the meaning. */
const Notice: React.FC<{ icon: React.ReactNode; children: string; theme: Theme }> = ({
  icon,
  children,
  theme,
}) => (
  <View
    style={{
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.border,
      backgroundColor: theme.canvas,
      padding: spacing.md,
    }}
  >
    <View style={{ marginTop: 2 }}>{icon}</View>
    <Body size={13} tone="secondary" style={{ flex: 1 }}>
      {children}
    </Body>
  </View>
)

/** Coach alerts. Severity is carried by the icon and the spoken prefix, not by color alone. */
const AlertRow: React.FC<{ alert: CoachAlert; theme: Theme }> = ({ alert, theme }) => {
  const warning = alert.severity === 'warning'
  const accent = warning ? theme.status.warning : theme.textMuted
  return (
    <Surface style={{ padding: spacing.lg }} radius={radius.control}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 2 }}>
          {warning ? (
            <AlertTriangle size={18} color={accent} strokeWidth={2} />
          ) : (
            <Info size={18} color={accent} strokeWidth={2} />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Body size={14} weight="semibold" style={{ color: warning ? accent : theme.text }}>
            {warning ? 'Warning: ' : 'Note: '}
            {alert.title}
          </Body>
          <Body size={13} tone="secondary">
            {alert.detail}
          </Body>
        </View>
      </View>
    </Surface>
  )
}

/**
 * A calorie anchor derived from the profile's formula burn. Selection is carried by the
 * border, the swapped icon and the spoken `selected` state — never by color alone.
 */
const PresetCell: React.FC<{
  label: string
  value: number
  active: boolean
  Icon: IconComponent
  onPress: () => void
  theme: Theme
}> = ({ label, value, active, Icon, onPress, theme }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    accessibilityLabel={`${label}: ${fmtInt(value)} kilocalories a day`}
    onPress={onPress}
    style={({ pressed }) => ({
      flex: 1,
      minHeight: HIT_SIZE,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: active ? theme.brand : theme.border,
      backgroundColor: pressed ? theme.border : theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xs,
      gap: 3,
    })}
  >
    <StatValue size={18}>{fmtInt(value)}</StatValue>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {active ? (
        <Check size={12} color={theme.brandText} strokeWidth={2.4} />
      ) : (
        <Icon size={12} color={theme.textSecondary} strokeWidth={2} />
      )}
      <Body
        size={12}
        weight="semibold"
        style={{ color: active ? theme.brandText : theme.textSecondary }}
      >
        {label}
      </Body>
    </View>
  </Pressable>
)

/** Fields hold text, not numbers, so the user can clear one without it snapping to 0. */
interface Draft {
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
}

const toDraft = (goals: {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}): Draft => ({
  calories: String(Math.round(goals.calories)),
  protein: String(Math.round(goals.protein)),
  carbs: String(Math.round(goals.carbs)),
  fat: String(Math.round(goals.fat)),
  fiber: String(Math.round(goals.fiber)),
})

/** Returns a whole non-negative number, or null when the field is blank or nonsense. */
const parseField = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

export default function GoalsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const coach = useCoach()

  const goals = useStore(s => s.goals)
  const profile = useStore(s => s.profile)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const updateGoals = useStore(s => s.updateGoals)

  const [draft, setDraft] = useState<Draft>(() => toDraft(goals))
  const [saved, setSaved] = useState(false)

  /*
    The manual form is seeded from the saved goals, so it has to re-seed whenever those
    goals change underneath it — accepting a coach plan writes calories and macros straight
    into the store. Without this, Save would quietly revert a plan the user just accepted a
    few centimetres up the screen. Goals only ever change through an explicit action, so no
    in-progress edit is lost.
  */
  const lastGoalsRef = useRef(goals)
  useEffect(() => {
    if (lastGoalsRef.current === goals) return
    lastGoalsRef.current = goals
    setDraft(toDraft(goals))
    setSaved(false)
  }, [goals])

  const formula = useMemo(() => {
    const bmr = calculateBMR(profile, currentWeightKg)
    const tdee = calculateTDEE(bmr, profile.activityLevel)
    return { bmr, tdee, suggested: calculateCalorieGoal(tdee, profile.goal) }
  }, [profile, currentWeightKg])

  const parsed = {
    calories: parseField(draft.calories),
    protein: parseField(draft.protein),
    carbs: parseField(draft.carbs),
    fat: parseField(draft.fat),
    fiber: parseField(draft.fiber),
  }
  const complete =
    parsed.calories !== null &&
    parsed.calories > 0 &&
    parsed.protein !== null &&
    parsed.carbs !== null &&
    parsed.fat !== null &&
    parsed.fiber !== null

  // Atwater factors. Shown so the user can see when their grams and their calorie target
  // disagree, rather than silently saving two numbers that contradict each other.
  const macroCalories =
    complete && parsed.protein !== null && parsed.carbs !== null && parsed.fat !== null
      ? parsed.protein * 4 + parsed.carbs * 4 + parsed.fat * 9
      : null
  const macroGap =
    macroCalories !== null && parsed.calories !== null ? macroCalories - parsed.calories : null

  const setCalories = (value: number) => {
    setSaved(false)
    setDraft(prev => ({ ...prev, calories: String(Math.max(0, Math.round(value))) }))
  }

  const handleSave = () => {
    if (
      parsed.calories === null ||
      parsed.protein === null ||
      parsed.carbs === null ||
      parsed.fat === null ||
      parsed.fiber === null
    ) {
      return
    }

    // Keep the split percentages consistent with the grams the user just set, exactly as
    // acceptRecommendation does — otherwise the two disagree and whichever screen reads
    // the percentages next shows a split that was never chosen.
    const energy = parsed.protein * 4 + parsed.carbs * 4 + parsed.fat * 9
    const patch: Parameters<typeof updateGoals>[0] = {
      calories: parsed.calories,
      protein: parsed.protein,
      carbs: parsed.carbs,
      fat: parsed.fat,
      fiber: parsed.fiber,
    }
    if (energy > 0) {
      const proteinPct = Math.round((parsed.protein * 4 * 100) / energy)
      const fatPct = Math.round((parsed.fat * 9 * 100) / energy)
      patch.proteinPct = proteinPct
      patch.fatPct = fatPct
      patch.carbsPct = Math.max(0, 100 - proteinPct - fatPct)
    }

    updateGoals(patch)
    setSaved(true)
  }

  const rec = coach.recommendation
  const phase = rec ? PHASE_META[rec.phase] : null
  const rate = rec?.targetRateKgPerWeek ?? 0
  const rateCaption = rate < 0 ? 'losing' : rate > 0 ? 'gaining' : 'holding steady'

  const presets: { label: string; delta: number; Icon: IconComponent }[] = [
    { label: 'Cut', delta: -500, Icon: TrendingDown },
    { label: 'Maintain', delta: 0, Icon: Minus },
    { label: 'Bulk', delta: 300, Icon: TrendingUp },
  ]

  return (
    <Screen
      title="Goals"
      subtitle="Your coach plan and your own numbers"
      right={
        <IconButton accessibilityLabel="Go back" onPress={() => router.back()}>
          <ArrowLeft size={20} color={theme.text} strokeWidth={2} />
        </IconButton>
      }
    >
      {/* ---------------------------------------------------------------- */}
      {/* The coach plan. Glass: it is the hero of this screen.             */}
      {/* ---------------------------------------------------------------- */}
      <GlassSurface style={{ padding: spacing.xl, gap: spacing.lg }}>
        {coach.loading && !rec ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Building your plan"
            style={{ gap: spacing.md, alignItems: 'center', paddingVertical: spacing.lg }}
          >
            <ActivityIndicator color={theme.brandText} />
            <Body tone="secondary" style={{ textAlign: 'center' }}>
              Reading your weigh-ins, your measurements and what you have actually logged.
            </Body>
          </View>
        ) : !rec ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Sparkles size={20} color={theme.brandText} strokeWidth={2} />
              <SectionTitle>Coach</SectionTitle>
            </View>
            <Body tone="secondary">
              Coach reads your weight trend, what you have actually logged and your body
              measurements, works out the calories you really burn, then proposes a phase with a
              calorie target and macros to match. Nothing touches your goals until you accept it.
            </Body>
            <Button
              label="Get my plan"
              onPress={coach.refresh}
              icon={<Sparkles size={16} color={theme.brandOn} strokeWidth={2} />}
              full
            />
            {coach.error ? (
              <Notice
                icon={<WifiOff size={16} color={theme.textMuted} strokeWidth={2} />}
                theme={theme}
              >
                {coach.error}
              </Notice>
            ) : null}
          </>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Label>Your coach</Label>
                <SectionTitle>{rec.headline}</SectionTitle>
              </View>
              {phase ? (
                <Pill color={theme.brandText}>
                  <phase.Icon size={13} color={theme.brandText} strokeWidth={2.2} />
                  <Body size={12} weight="semibold" style={{ color: theme.brandText }}>
                    {phase.label}
                  </Body>
                </Pill>
              ) : null}
            </View>

            {/* The one number the whole card exists for. */}
            <View style={{ gap: 4 }}>
              <StatValue size={56} accessibilityLabel={`${fmtInt(rec.calories)} kilocalories per day`}>
                {fmtInt(rec.calories)}
              </StatValue>
              <Label>kcal per day</Label>
              <Body size={13} tone="muted">
                {`Built around your ${fmtInt(rec.tdeeUsed)} kcal/day ${coach.anchorSource} burn`}
              </Body>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <FigureCell
                theme={theme}
                label="Protein"
                value={fmtInt(rec.protein)}
                unit="g"
                dot={theme.macro.protein}
                color={theme.macro.protein}
              />
              <FigureCell
                theme={theme}
                label="Carbs"
                value={fmtInt(rec.carbs)}
                unit="g"
                dot={theme.macro.carbs}
                color={theme.macro.carbs}
              />
              <FigureCell
                theme={theme}
                label="Fat"
                value={fmtInt(rec.fat)}
                unit="g"
                dot={theme.macro.fat}
                color={theme.macro.fat}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <FigureCell
                theme={theme}
                label="Target rate"
                value={`${rate > 0 ? '+' : ''}${rate.toFixed(2)}`}
                caption={`kg per week · ${rateCaption}`}
              />
              <FigureCell
                theme={theme}
                label="Duration"
                value={String(rec.durationWeeks)}
                caption="weeks in this phase"
              />
            </View>

            <Body size={13} tone="secondary">
              {rec.rationale}
            </Body>

            {coach.error ? (
              <Notice
                icon={<WifiOff size={16} color={theme.textMuted} strokeWidth={2} />}
                theme={theme}
              >
                {`${coach.error} Press Refresh once you are back online.`}
              </Notice>
            ) : rec.source === 'local' ? (
              <Notice
                icon={<WifiOff size={16} color={theme.textMuted} strokeWidth={2} />}
                theme={theme}
              >
                This is the offline estimate, calculated on your device from your own numbers
                rather than by the AI coach. Refresh to ask the coach for a full plan.
              </Notice>
            ) : null}

            {rec.clamped ? (
              <Notice
                icon={<ShieldCheck size={16} color={theme.textMuted} strokeWidth={2} />}
                theme={theme}
              >
                Some of these numbers were adjusted to stay inside a safe range — calories within
                25% of your burn, protein 1.4-3.0 g per kg, and enough fat for hormone health.
              </Notice>
            ) : null}

            {coach.accepted ? (
              <View
                style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
                accessibilityLiveRegion="polite"
              >
                <View style={{ marginTop: 2 }}>
                  <Check size={16} color={theme.status.good} strokeWidth={2.4} />
                </View>
                <Body size={13} weight="medium" style={{ flex: 1, color: theme.status.good }}>
                  {`Accepted. Your daily goals now match this plan: ${fmtInt(rec.calories)} kcal, ${fmtInt(rec.protein)} g protein, ${fmtInt(rec.carbs)} g carbs, ${fmtInt(rec.fat)} g fat.`}
                </Body>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button
                label={coach.accepted ? 'Plan accepted' : 'Accept plan'}
                onPress={coach.accept}
                disabled={coach.accepted}
                haptic
                icon={<Check size={16} color={theme.brandOn} strokeWidth={2.2} />}
              />
              <Button
                label={coach.loading ? 'Refreshing' : 'Refresh'}
                variant="secondary"
                onPress={coach.refresh}
                loading={coach.loading}
                icon={<RefreshCw size={16} color={theme.text} strokeWidth={2} />}
              />
            </View>
          </>
        )}
      </GlassSurface>

      {/* Alerts: real findings from the user's own data, or nothing at all. */}
      {coach.alerts.map(alert => (
        <AlertRow key={alert.id} alert={alert} theme={theme} />
      ))}

      {/* ---------------------------------------------------------------- */}
      {/* Predicted versus measured burn                                    */}
      {/* ---------------------------------------------------------------- */}
      <Surface style={{ padding: spacing.xl, gap: spacing.lg }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.sm,
          }}
        >
          <SectionTitle style={{ flex: 1 }}>Your calorie burn</SectionTitle>
          <Pill>{CONFIDENCE_LABEL[coach.tdee.confidence]}</Pill>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <FigureCell
            theme={theme}
            label="Predicted"
            icon={<Activity size={13} color={theme.textMuted} strokeWidth={2} />}
            value={fmtInt(coach.tdee.predicted)}
            caption={`kcal/day · ${BASIS_LABEL[coach.tdee.basis]}`}
          />
          {coach.tdee.measured === null ? (
            <FigureCell
              theme={theme}
              label="Measured"
              icon={<Flame size={13} color={theme.textMuted} strokeWidth={2} />}
              value="—"
              valueLabel="Not measured yet"
              muted
              caption="Not enough data yet"
            />
          ) : (
            <FigureCell
              theme={theme}
              label="Measured"
              icon={<Flame size={13} color={theme.textMuted} strokeWidth={2} />}
              value={fmtInt(coach.tdee.measured)}
              caption="kcal/day · from your own log"
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Days of data</Label>
            <StatValue size={18}>{String(coach.tdee.daysOfData)}</StatValue>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Weight trend</Label>
            {/* Always kg/week: the estimate and every coach alert quote kg, and mixing
                units between the two on one screen is worse than a single conversion. */}
            {coach.tdee.weightTrendKgPerWeek === null ? (
              <Body size={13} tone="muted" weight="medium">
                Not enough weigh-ins
              </Body>
            ) : (
              <StatValue size={18}>
                {`${coach.tdee.weightTrendKgPerWeek > 0 ? '+' : ''}${coach.tdee.weightTrendKgPerWeek.toFixed(2)} kg/wk`}
              </StatValue>
            )}
          </View>
        </View>

        <Body size={13} tone="secondary">
          {explainTdee(coach.tdee)}
        </Body>
      </Surface>

      {/* ---------------------------------------------------------------- */}
      {/* Manual targets — the user always has the last word                */}
      {/* ---------------------------------------------------------------- */}
      <View style={{ gap: 6, paddingTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <SlidersHorizontal size={16} color={theme.textMuted} strokeWidth={2} />
          <SectionTitle>Manual targets</SectionTitle>
        </View>
        <Body size={13} tone="secondary">
          The coach only ever recommends. Set anything you like here and press Save — your
          numbers win until you accept a new plan.
        </Body>
      </View>

      <Surface style={{ padding: spacing.xl, gap: spacing.lg }}>
        <Field
          label="Daily calories (kcal)"
          numeric
          value={draft.calories}
          onChangeText={text => {
            setSaved(false)
            setDraft(prev => ({ ...prev, calories: text }))
          }}
          keyboardType="number-pad"
          returnKeyType="done"
          accessibilityLabel="Daily calorie target in kilocalories"
          placeholder="2000"
        />

        <View style={{ gap: spacing.sm }}>
          <Label>Anchor to your formula burn</Label>
          <Body size={12} tone="muted">
            {`Your profile puts your burn at ${fmtInt(formula.tdee)} kcal a day.`}
          </Body>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {presets.map(({ label, delta, Icon }) => {
              const value = Math.max(1000, formula.tdee + delta)
              return (
                <PresetCell
                  key={label}
                  label={label}
                  value={value}
                  active={parsed.calories === value}
                  Icon={Icon}
                  onPress={() => setCalories(value)}
                  theme={theme}
                />
              )
            })}
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <FigureCell
            theme={theme}
            label="BMR"
            value={fmtInt(formula.bmr)}
            caption="kcal at rest"
          />
          <FigureCell
            theme={theme}
            label="TDEE"
            value={fmtInt(formula.tdee)}
            caption="kcal you burn"
          />
          <FigureCell
            theme={theme}
            label="Suggested"
            value={fmtInt(formula.suggested)}
            caption={`kcal to ${profile.goal}`}
          />
        </View>
      </Surface>

      <Surface style={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={{ gap: 4 }}>
          <SectionTitle>Macro grams</SectionTitle>
          <Body size={13} tone="secondary">
            Set grams directly. These are what the diary counts against.
          </Body>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={theme.macro.protein} />
              <Label>Protein (g)</Label>
            </View>
            <Field
              numeric
              value={draft.protein}
              onChangeText={text => {
                setSaved(false)
                setDraft(prev => ({ ...prev, protein: text }))
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Protein target in grams"
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={theme.macro.carbs} />
              <Label>Carbs (g)</Label>
            </View>
            <Field
              numeric
              value={draft.carbs}
              onChangeText={text => {
                setSaved(false)
                setDraft(prev => ({ ...prev, carbs: text }))
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Carbohydrate target in grams"
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={theme.macro.fat} />
              <Label>Fat (g)</Label>
            </View>
            <Field
              numeric
              value={draft.fat}
              onChangeText={text => {
                setSaved(false)
                setDraft(prev => ({ ...prev, fat: text }))
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Fat target in grams"
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={theme.macro.fiber} />
              <Label>Fiber (g)</Label>
            </View>
            <Field
              numeric
              value={draft.fiber}
              onChangeText={text => {
                setSaved(false)
                setDraft(prev => ({ ...prev, fiber: text }))
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              accessibilityLabel="Fiber target in grams"
            />
          </View>
        </View>

        {/* Honest arithmetic check: status is carried by an icon and words, never by hue. */}
        {!complete ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 2 }}>
              <AlertTriangle size={16} color={theme.status.warning} strokeWidth={2.2} />
            </View>
            <Body size={13} weight="medium" style={{ flex: 1, color: theme.status.warning }}>
              Incomplete: every field needs a number before these targets can be saved.
            </Body>
          </View>
        ) : macroGap !== null && Math.abs(macroGap) > NOISE_KCAL ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 2 }}>
              <AlertTriangle size={16} color={theme.status.warning} strokeWidth={2.2} />
            </View>
            <Body size={13} weight="medium" style={{ flex: 1, color: theme.status.warning }}>
              {`Mismatch: your macros add up to ${fmtInt(macroCalories ?? 0)} kcal, which is ${fmtInt(Math.abs(macroGap))} kcal ${macroGap > 0 ? 'above' : 'below'} your calorie target. Saving keeps both exactly as typed.`}
            </Body>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 2 }}>
              <Check size={16} color={theme.status.good} strokeWidth={2.2} />
            </View>
            <Body size={13} weight="medium" style={{ flex: 1, color: theme.status.good }}>
              {`Balanced: your macros add up to ${fmtInt(macroCalories ?? 0)} kcal.`}
            </Body>
          </View>
        )}

        <Button
          label={saved ? 'Saved' : 'Save targets'}
          onPress={handleSave}
          disabled={!complete}
          full
          haptic
          icon={
            saved ? (
              <Check size={16} color={theme.brandOn} strokeWidth={2.4} />
            ) : (
              <SlidersHorizontal size={16} color={theme.brandOn} strokeWidth={2} />
            )
          }
        />
        <Body
          size={12}
          tone="muted"
          style={{ textAlign: 'center', minHeight: HIT_SIZE / 2 }}
        >
          {saved
            ? 'Saved. These are now your daily targets.'
            : 'Saving replaces your daily targets with the numbers above.'}
        </Body>
      </Surface>
    </Screen>
  )
}
