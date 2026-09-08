import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { ArrowLeft, Check, Minus, Plus, Search, TriangleAlert, X } from 'lucide-react-native'

import { GlassSurface, Surface } from '@/components/Glass'
import { Button, IconButton } from '@/components/Button'
import { EmptyState, Field, Pill } from '@/components/Layout'
import { Body, Label, SectionTitle, StatValue } from '@/components/Text'
import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, fonts, radius, spacing } from '@/theme/tokens'
import type { Food, MealType } from '@core/types'
import { getFoodById, searchFoods } from '@core/data/foodDatabase'
import { searchUSDA } from '@core/utils/usdaApi'
import { searchOpenFoodFacts } from '@core/utils/openFoodFacts'
import { formatDate, getTodayString } from '@core/utils/calculations'
import { Aurora } from '@/components/Aurora'
import { LiquidGlassScene } from '@/components/LiquidGlass'

const MEAL_TYPES: readonly MealType[] = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snacks',
  'Pre-Workout',
  'Post-Workout',
]

const HAIRLINE = StyleSheet.hairlineWidth * 2

/** Below two characters the remote endpoints return thousands of useless matches. */
const REMOTE_MIN_QUERY = 2

/**
 * Where a remote result came from. Shown as a small label on the row rather than as a
 * section heading: provenance is worth having, but nobody searching for "paneer" is
 * choosing between government nutrient databases.
 */
type RemoteSource = 'usda' | 'off'

const SOURCE_LABEL: Record<RemoteSource, string> = {
  usda: 'USDA',
  off: 'Open Food Facts',
}

/** Long enough that a normal typing burst is one request, short enough to feel live. */
const DEBOUNCE_MS = 350

/**
 * Units where "how many grams" is a more natural question than "how many servings",
 * mapped to the amount one press of +/- should move. Deriving the step from the serving
 * size instead would give a 100 g food a tidy 25 and a 182 g food a step of 46.
 */
const MEASURED_UNIT_STEP: Record<string, number> = {
  g: 10,
  mg: 10,
  ml: 10,
  l: 0.1,
  oz: 1,
  'fl oz': 1,
}

const round2 = (value: number): number => Math.round(value * 100) / 100

/** Servings are a multiplier, so they keep more precision than a displayed figure. */
const round4 = (value: number): number => Math.round(value * 10000) / 10000

const formatAmount = (value: number): string => String(round2(value))

const isMealType = (value: unknown): value is MealType =>
  typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value)

const isISODate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

/**
 * Orders the merged remote hits so the obvious answer is first.
 *
 * Two databases returning ten rows each is twenty rows in whatever order the network
 * happened to resolve them, which for a query like "dal" opened with
 * "Dal, dehydrated, industrial" from a US nutrient table. Interleaving by arrival is not
 * ranking, it is chance.
 *
 * The scoring is deliberately crude, because the alternative is pretending we can rank
 * across two schemas we do not control:
 *   - an exact name match beats everything
 *   - a name that starts with the query beats one that merely contains it
 *   - shorter names win ties, since specificity in these databases is expressed by piling
 *     on qualifiers ("Rice, white, long-grain, regular, raw, enriched")
 */
const rankRemote = (hits: RemoteHit[], query: string): RemoteHit[] => {
  const needle = query.trim().toLowerCase()

  const score = (hit: RemoteHit): number => {
    const name = hit.food.name.toLowerCase()
    if (name === needle) return 0
    if (name.startsWith(needle)) return 1
    if (name.includes(needle)) return 2
    // Matched on brand or description rather than name.
    return 3
  }

  return [...hits].sort((a, b) => {
    const delta = score(a) - score(b)
    if (delta !== 0) return delta
    return a.food.name.length - b.food.name.length
  })
}

/** A remote hit, tagged with the database that answered. */
interface RemoteHit {
  food: Food
  source: RemoteSource
}

/**
 * Both remote databases, as one state.
 *
 * They used to be two sections with two spinners, two error rows and two empty rows, all of
 * which could be on screen at once — five sections in a list whose whole job is to answer
 * one question. `failed` counts how many sources gave up, so the list can stay quiet when
 * one of them still produced results.
 */
type RemoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; hits: RemoteHit[]; failed: number }

type Row =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'food'; key: string; food: Food; source?: RemoteSource }
  | { kind: 'remote-loading'; key: string }
  | { kind: 'remote-error'; key: string }
  | { kind: 'remote-empty'; key: string }

// --- Shared pieces ----------------------------------------------------------

const MacroChips: React.FC<{ protein: number; carbs: number; fat: number }> = ({
  protein,
  carbs,
  fat,
}) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
      <View accessible accessibilityLabel={`Protein ${protein} grams`}>
        <Pill color={theme.macro.protein}>{`P ${protein}g`}</Pill>
      </View>
      <View accessible accessibilityLabel={`Carbs ${carbs} grams`}>
        <Pill color={theme.macro.carbs}>{`C ${carbs}g`}</Pill>
      </View>
      <View accessible accessibilityLabel={`Fat ${fat} grams`}>
        <Pill color={theme.macro.fat}>{`F ${fat}g`}</Pill>
      </View>
    </View>
  )
}

/**
 * A selectable chip. Selection is carried by a fill AND a check mark, never by hue alone,
 * and the brand fill is jade-600 — the contrast floor for white text.
 */
const ChoiceChip: React.FC<{
  label: string
  selected: boolean
  accessibilityLabel: string
  onPress: () => void
}> = ({ label, selected, accessibilityLabel, onPress }) => {
  const theme = useTheme()
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{
        minHeight: HIT_SIZE,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        borderWidth: HAIRLINE,
        borderColor: selected ? theme.brand : theme.border,
        backgroundColor: selected ? theme.brand : theme.surface,
      }}
    >
      {selected ? <Check size={14} color={theme.brandOn} strokeWidth={2.6} /> : null}
      <Body
        size={13}
        weight="semibold"
        style={{ color: selected ? theme.brandOn : theme.textSecondary }}
      >
        {label}
      </Body>
    </Pressable>
  )
}

const SearchBar: React.FC<{
  value: string
  onChange: (next: string) => void
}> = ({ value, onChange }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingLeft: 14,
        minHeight: HIT_SIZE,
        borderRadius: radius.control,
        borderWidth: HAIRLINE,
        borderColor: theme.border,
        backgroundColor: theme.surface,
      }}
    >
      <Search size={18} color={theme.textMuted} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search foods and brands"
        placeholderTextColor={theme.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search foods and brands"
        style={{
          flex: 1,
          paddingVertical: 10,
          color: theme.text,
          fontFamily: fonts.body,
          fontSize: 16,
        }}
      />
      {value.length > 0 ? (
        <IconButton accessibilityLabel="Clear the search" onPress={() => onChange('')}>
          <X size={18} color={theme.textMuted} strokeWidth={2} />
        </IconButton>
      ) : (
        <View style={{ width: spacing.md }} />
      )}
    </View>
  )
}

const FoodRow: React.FC<{ food: Food; source?: RemoteSource; onPress: () => void }> = ({
  food,
  source,
  onPress,
}) => {
  const theme = useTheme()
  const serving = `${formatAmount(food.servingSize)} ${food.servingUnit}`
  // Provenance rides on the row's existing meta line rather than earning a heading of its
  // own. Someone comparing two similar entries wants to know which database each came from;
  // nobody wants to pick a database before they can search.
  const meta = [food.brand, serving, source ? SOURCE_LABEL[source] : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${food.name}${
        food.brand ? `, ${food.brand}` : ''
      }. ${food.calories} kilocalories per ${serving}. Protein ${Math.round(
        food.protein
      )} grams, carbs ${Math.round(food.carbs)} grams, fat ${Math.round(food.fat)} grams`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Surface style={{ padding: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Body size={14} weight="medium" numberOfLines={2}>
              {food.name}
            </Body>
            <Body size={12} tone="muted" numberOfLines={1}>
              {meta}
            </Body>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <StatValue size={18}>{food.calories}</StatValue>
            <Body size={10} tone="muted">
              kcal
            </Body>
          </View>
        </View>
        <MacroChips
          protein={Math.round(food.protein)}
          carbs={Math.round(food.carbs)}
          fat={Math.round(food.fat)}
        />
      </Surface>
    </Pressable>
  )
}

// --- Screen -----------------------------------------------------------------

export default function FoodSearchScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ meal?: string; date?: string }>()

  const date = isISODate(params.date) ? params.date : getTodayString()

  const addFoodEntry = useStore(s => s.addFoodEntry)
  const updateStreak = useStore(s => s.updateStreak)
  const customFoods = useStore(s => s.customFoods)
  const recentFoodIds = useStore(s => s.recentFoodIds)

  const [meal, setMeal] = useState<MealType>(isMealType(params.meal) ? params.meal : 'Snacks')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [remote, setRemote] = useState<RemoteState>({ status: 'idle' })
  const [retryToken, setRetryToken] = useState(0)

  const [selected, setSelected] = useState<Food | null>(null)
  const [unitMode, setUnitMode] = useState<'serving' | 'measure'>('serving')
  const [quantity, setQuantity] = useState('1')

  // --- Search ---------------------------------------------------------------

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Every remote reply carries the id of the request that asked for it. Without that guard a
  // slow response for "chi" can land after a fast one for "chicken" and replace it.
  const requestRef = useRef(0)

  useEffect(() => {
    const requestId = ++requestRef.current

    if (debounced.length < REMOTE_MIN_QUERY) {
      setRemote({ status: 'idle' })
      return
    }

    setRemote({ status: 'loading' })
    let cancelled = false

    /*
      Both sources are asked at once and settled together. `allSettled`, not `all`: they
      answer different questions — USDA is a composition table, Open Food Facts is a barcode
      catalogue — so one being down is no reason to discard what the other found.

      They also fail independently and often. Open Food Facts is community-run and slower;
      USDA rate-limits. A user who gets eight useful branded matches should not be shown an
      error because the other database timed out.
    */
    void Promise.allSettled([
      searchUSDA(debounced, 10),
      searchOpenFoodFacts(debounced, 10),
    ]).then(([usdaResult, offResult]) => {
      if (cancelled || requestRef.current !== requestId) return

      const hits: RemoteHit[] = []
      let failed = 0

      if (usdaResult.status === 'fulfilled') {
        for (const food of usdaResult.value) hits.push({ food, source: 'usda' })
      } else {
        failed += 1
      }

      if (offResult.status === 'fulfilled') {
        for (const food of offResult.value) hits.push({ food, source: 'off' })
      } else {
        failed += 1
      }

      setRemote({ status: 'ready', hits: rankRemote(hits, debounced), failed })
    })

    return () => {
      cancelled = true
    }
  }, [debounced, retryToken])

  const customMatches = useMemo(() => {
    if (debounced.length === 0) return customFoods.slice(0, 12)
    const needle = debounced.toLowerCase()
    return customFoods
      .filter(
        food =>
          food.name.toLowerCase().includes(needle) ||
          (food.brand?.toLowerCase().includes(needle) ?? false)
      )
      .slice(0, 12)
  }, [customFoods, debounced])

  const presetMatches = useMemo(() => searchFoods(debounced, 25), [debounced])

  const recentMatches = useMemo(() => {
    if (debounced.length > 0) return []
    const found: Food[] = []
    for (const id of recentFoodIds) {
      // A USDA food only ever existed inside the entry that logged it, so ids that resolve
      // to nothing are skipped rather than rendered as a broken row.
      const food = customFoods.find(item => item.id === id) ?? getFoodById(id)
      if (food) found.push(food)
      if (found.length >= 8) break
    }
    return found
  }, [recentFoodIds, customFoods, debounced])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const seen = new Set<string>()

    const addSection = (id: string, title: string, foods: Food[]) => {
      const fresh = foods.filter(food => !seen.has(food.id))
      if (fresh.length === 0) return
      out.push({ kind: 'section', key: `section-${id}`, title })
      for (const food of fresh) {
        seen.add(food.id)
        out.push({ kind: 'food', key: `${id}-${food.id}`, food })
      }
    }

    addSection('recent', 'Recent', recentMatches)
    addSection('custom', 'Your foods', customMatches)
    addSection('preset', debounced.length > 0 ? 'Matches' : 'Food database', presetMatches)

    /*
      One remote section, not two.

      USDA and Open Food Facts used to get a heading each, which put five sections on a list
      whose job is to answer one question, and duplicated every loading, error and empty
      state — all of which could render simultaneously. Provenance moved onto the row, where
      it informs without organising.
    */
    if (debounced.length >= REMOTE_MIN_QUERY) {
      out.push({ kind: 'section', key: 'section-remote', title: 'More results' })

      if (remote.status === 'loading' || remote.status === 'idle') {
        out.push({ kind: 'remote-loading', key: 'remote-loading' })
      } else {
        const fresh = remote.hits.filter(hit => !seen.has(hit.food.id))
        for (const hit of fresh) {
          seen.add(hit.food.id)
          out.push({ kind: 'food', key: `remote-${hit.food.id}`, food: hit.food, source: hit.source })
        }
        // Only a total failure is worth saying. One source down while the other answered is
        // not something the user can act on, and an error row above real results reads as if
        // those results are suspect.
        if (fresh.length === 0) {
          out.push(
            remote.failed === 2
              ? { kind: 'remote-error', key: 'remote-error' }
              : { kind: 'remote-empty', key: 'remote-empty' }
          )
        }
      }
    }

    return out
  }, [recentMatches, customMatches, presetMatches, debounced, remote])

  const hasResults = rows.some(row => row.kind === 'food')

  // --- Serving step ---------------------------------------------------------

  const openServingStep = useCallback((food: Food) => {
    setSelected(food)
    setUnitMode('serving')
    setQuantity('1')
  }, [])

  const measureStep =
    selected === null ? undefined : MEASURED_UNIT_STEP[selected.servingUnit]
  const measurable = selected !== null && selected.servingSize > 0 && measureStep !== undefined

  const parsedQuantity = Number.parseFloat(quantity.replace(',', '.'))
  const quantityValid = Number.isFinite(parsedQuantity) && parsedQuantity > 0

  const servings =
    selected === null || !quantityValid
      ? 0
      : unitMode === 'serving'
        ? parsedQuantity
        : parsedQuantity / selected.servingSize

  const step = (delta: number) => {
    if (selected === null) return
    const inServings = unitMode === 'serving'
    const base = quantityValid ? parsedQuantity : inServings ? 1 : selected.servingSize
    const increment = inServings ? 0.5 : (measureStep ?? 1)
    // Never step to zero: an amount of nothing is a deletion, not an edit.
    setQuantity(formatAmount(Math.max(increment, base + delta * increment)))
  }

  const switchUnit = (next: 'serving' | 'measure') => {
    if (selected === null || next === unitMode) return
    setUnitMode(next)
    setQuantity(next === 'serving' ? '1' : formatAmount(selected.servingSize))
  }

  const logFood = () => {
    if (selected === null || !quantityValid || servings <= 0) return
    addFoodEntry(date, {
      foodId: selected.id,
      food: selected,
      servings: round4(servings),
      mealType: meal,
    })
    updateStreak()
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    router.back()
  }

  // --- Render ---------------------------------------------------------------

  const headerTitle = selected === null ? 'Add food' : selected.name
  const headerSubtitle =
    selected === null ? `${meal} · ${formatDate(date)}` : selected.brand ?? 'Choose an amount'

  const header = (
    <GlassSurface
      radius={0}
      bordered={false}
      style={{
        paddingTop: insets.top,
        borderBottomWidth: HAIRLINE,
        borderBottomColor: theme.glass.border,
        zIndex: 10,
      }}
    >
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.md,
          gap: spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <IconButton
            accessibilityLabel={selected === null ? 'Close food search' : 'Back to search results'}
            onPress={() => (selected === null ? router.back() : setSelected(null))}
            style={{ marginLeft: -spacing.md }}
          >
            {selected === null ? (
              <X size={22} color={theme.text} strokeWidth={2} />
            ) : (
              <ArrowLeft size={22} color={theme.text} strokeWidth={2} />
            )}
          </IconButton>
          <View style={{ flex: 1 }}>
            <SectionTitle>{headerTitle}</SectionTitle>
            <Body size={12} tone="muted" numberOfLines={1}>
              {headerSubtitle}
            </Body>
          </View>
        </View>

        {selected === null && <SearchBar value={query} onChange={setQuery} />}
      </View>
    </GlassSurface>
  )

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'section') {
      return (
        <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
          <Label>{item.title}</Label>
        </View>
      )
    }

    if (item.kind === 'food') {
      return (
        <FoodRow
          food={item.food}
          source={item.source}
          onPress={() => openServingStep(item.food)}
        />
      )
    }

    if (item.kind === 'remote-loading') {
      return (
        <Surface style={{ padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <ActivityIndicator color={theme.brandText} />
          <Body size={13} tone="secondary">
            Searching the online food databases…
          </Body>
        </Surface>
      )
    }

    if (item.kind === 'remote-error') {
      // An empty list here would read as "this food does not exist". It is a network
      // failure, so it says so, in words, with an icon, and offers the retry.
      return (
        <Surface style={{ padding: spacing.md, gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <TriangleAlert size={16} color={theme.status.warning} strokeWidth={2.2} />
            <Body size={13} weight="semibold" style={{ flex: 1, color: theme.status.warning }}>
              Could not reach the online food databases
            </Body>
          </View>
          <Body size={12} tone="secondary">
            Check your connection. Everything above still works offline.
          </Body>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => setRetryToken(token => token + 1)}
          />
        </Surface>
      )
    }

    return (
      <Surface style={{ padding: spacing.md }}>
        <Body size={13} tone="secondary">
          Nothing else online. Try a shorter word, a brand name, or the plain ingredient.
        </Body>
      </Surface>
    )
  }

  if (selected !== null) {
    const kcal = Math.round(selected.calories * servings)
    const protein = Math.round(selected.protein * servings)
    const carbs = Math.round(selected.carbs * servings)
    const fat = Math.round(selected.fat * servings)
    const fiber = Math.round(selected.fiber * servings)
    const unitLabel = unitMode === 'serving' ? 'servings' : selected.servingUnit

    return (
      <LiquidGlassScene backdrop={<Aurora />} style={{ backgroundColor: theme.canvas }}>
        {header}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.xxl,
            gap: spacing.lg,
          }}
        >
          <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
            <Label>Amount</Label>

            {measurable && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                <ChoiceChip
                  label="Servings"
                  selected={unitMode === 'serving'}
                  accessibilityLabel={`Measure in servings of ${formatAmount(
                    selected.servingSize
                  )} ${selected.servingUnit}`}
                  onPress={() => switchUnit('serving')}
                />
                <ChoiceChip
                  label={selected.servingUnit}
                  selected={unitMode === 'measure'}
                  accessibilityLabel={`Measure in ${selected.servingUnit}`}
                  onPress={() => switchUnit('measure')}
                />
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <IconButton
                accessibilityLabel={`Decrease the amount in ${unitLabel}`}
                onPress={() => step(-1)}
                style={{ borderWidth: HAIRLINE, borderColor: theme.border, borderRadius: radius.control }}
              >
                <Minus size={18} color={theme.text} strokeWidth={2.2} />
              </IconButton>
              <View style={{ flex: 1 }}>
                <Field
                  numeric
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  accessibilityLabel={`Amount in ${unitLabel}`}
                />
              </View>
              <IconButton
                accessibilityLabel={`Increase the amount in ${unitLabel}`}
                onPress={() => step(1)}
                style={{ borderWidth: HAIRLINE, borderColor: theme.border, borderRadius: radius.control }}
              >
                <Plus size={18} color={theme.text} strokeWidth={2.2} />
              </IconButton>
            </View>

            <Body size={12} tone="muted">
              {unitMode === 'serving'
                ? `Servings of ${formatAmount(selected.servingSize)} ${selected.servingUnit}`
                : `${selected.servingUnit} — one serving is ${formatAmount(selected.servingSize)} ${
                    selected.servingUnit
                  }`}
            </Body>

            {!quantityValid && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TriangleAlert size={14} color={theme.status.critical} strokeWidth={2.2} />
                <Body size={12} weight="medium" style={{ flex: 1, color: theme.status.critical }}>
                  Enter an amount greater than zero.
                </Body>
              </View>
            )}
          </Surface>

          <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
            <Label>Meal</Label>
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
              {MEAL_TYPES.map(option => (
                <ChoiceChip
                  key={option}
                  label={option}
                  selected={option === meal}
                  accessibilityLabel={`Log this as ${option}`}
                  onPress={() => setMeal(option)}
                />
              ))}
            </View>
          </Surface>

          <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
            <Label>Adds to your day</Label>
            {quantityValid ? (
              <>
                <View
                  style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}
                  accessible
                  accessibilityLabel={`${kcal} kilocalories`}
                >
                  <StatValue size={34}>{kcal}</StatValue>
                  <Body size={14} tone="muted">
                    kcal
                  </Body>
                </View>
                <MacroChips protein={protein} carbs={carbs} fat={fat} />
                <View
                  style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}
                  accessible
                  accessibilityLabel={`Fiber ${fiber} grams`}
                >
                  <Label>Fiber</Label>
                  <StatValue size={13} color={theme.macro.fiber}>
                    {fiber}
                  </StatValue>
                  <Body size={11} tone="muted">
                    g
                  </Body>
                </View>
              </>
            ) : (
              <Body size={13} tone="secondary">
                Enter an amount to see what this adds.
              </Body>
            )}
          </Surface>

          <Button
            label={`Add to ${meal}`}
            full
            disabled={!quantityValid}
            onPress={logFood}
            icon={<Plus size={16} color={theme.brandOn} strokeWidth={2.4} />}
          />
        </ScrollView>
      </LiquidGlassScene>
    )
  }

  return (
    <LiquidGlassScene backdrop={<Aurora />} style={{ backgroundColor: theme.canvas }}>
      {header}
      <FlatList
        data={rows}
        keyExtractor={row => row.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.sm,
        }}
        ListFooterComponent={
          hasResults || remote.status === 'loading' ? null : (
            <EmptyState
              icon={<Search size={24} color={theme.textMuted} strokeWidth={2} />}
              title="No matches"
              message={
                debounced.length === 0
                  ? 'Type a dish, food or brand — Indian dishes and everyday foods are built in, and packaged products are looked up online.'
                  : 'Try a shorter word, a brand name, or the plain ingredient.'
              }
            />
          )
        }
      />
    </LiquidGlassScene>
  )
}
