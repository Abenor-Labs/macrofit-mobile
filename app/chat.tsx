import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { v4 as uuidv4 } from 'uuid'
import {
  AlertTriangle,
  Bot,
  Check,
  Droplets,
  Lightbulb,
  Scale,
  Send,
  User,
  Utensils,
  X,
} from 'lucide-react-native'

import type { Food } from '@core/types'
import { getTodayString, kgToLbs, lbsToKg } from '@core/utils/calculations'
import { postChat, type ChatMessageParam } from '@/lib/api'
import { useStore } from '@/store/useStore'
import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { Button, IconButton } from '@/components/Button'
import { Field, Screen } from '@/components/Layout'

/**
 * The nutrition assistant, ported from the web `ChatInterface`.
 *
 * Same context, same tools, same store mutations. Two things are handled more carefully
 * than on the web because they are silent data corruption otherwise:
 *   - a weight the model reports in a unit the profile does not use is converted before
 *     it is written (see `weightInProfileUnit`);
 *   - `discardedActions` is surfaced, so a reply that says "logged it" while the payload
 *     was thrown away does not read as a clean success.
 */

const WELCOME_ID = 'welcome'

const WELCOME_TEXT =
  "Hi! I'm your nutrition assistant. Tell me what you ate, your weight, or your water and I'll log it. Try \"I had 1 cup of oatmeal and 2 eggs for breakfast\" or \"I weighed 84 kg this morning\"."

/** A store mutation that actually landed, echoed back so the user can verify it. */
interface LoggedAction {
  type: 'food' | 'weight' | 'water'
  label: string
  value: number
  unit: string
  macros?: { protein: number; carbs: number; fat: number }
}

interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: LoggedAction[]
  /** Count of tool calls the client refused as unusable. Non-zero means `text` overclaims. */
  discarded?: number
  /** True when this turn failed outright; rendered with the critical status treatment. */
  failed?: boolean
}

const formatValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1)

const actionIcon = (
  type: LoggedAction['type'],
): React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> =>
  type === 'food' ? Utensils : type === 'weight' ? Scale : Droplets

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: color }} />
)

/** Macro identity is carried by the written name as well as the color. */
const MacroChip: React.FC<{ name: string; grams: number; color: string; theme: Theme }> = ({
  name,
  grams,
  color,
  theme,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: theme.border,
    }}
  >
    <Dot color={color} />
    <Body size={11} tone="muted" weight="medium">
      {name}
    </Body>
    <StatValue size={12}>{String(Math.round(grams))}</StatValue>
    <Body size={10} tone="muted">
      g
    </Body>
  </View>
)

const Avatar: React.FC<{ role: ChatEntry['role']; theme: Theme }> = ({ role, theme }) => (
  <View
    style={{
      width: 28,
      height: 28,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
      backgroundColor: role === 'user' ? theme.brand : theme.surface,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: role === 'user' ? theme.brand : theme.border,
    }}
  >
    {role === 'user' ? (
      <User size={14} color={theme.brandOn} strokeWidth={2.2} />
    ) : (
      <Bot size={14} color={theme.brandText} strokeWidth={2.2} />
    )}
  </View>
)

export default function ChatScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const goals = useStore(s => s.goals)
  const diary = useStore(s => s.diary)
  const profile = useStore(s => s.profile)
  const currentWeightKg = useStore(s => s.currentWeightKg)
  const addFoodEntry = useStore(s => s.addFoodEntry)
  const removeFoodEntry = useStore(s => s.removeFoodEntry)
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const addWater = useStore(s => s.addWater)
  const updateStreak = useStore(s => s.updateStreak)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState<ChatEntry[]>([
    { id: WELCOME_ID, role: 'assistant', text: WELCOME_TEXT },
  ])

  const scrollRef = useRef<ScrollView>(null)
  const scrollToEnd = useCallback(() => {
    // Deferred a frame: the new bubble has not been laid out when setState returns.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [])

  const send = async () => {
    const text = input.trim()
    if (text.length === 0 || loading) return

    const history: ChatMessageParam[] = messages
      .filter(m => m.id !== WELCOME_ID)
      .map(m => ({ role: m.role, content: m.text }))
    history.push({ role: 'user', content: text })

    setMessages(prev => [...prev, { id: uuidv4(), role: 'user', text }])
    setInput('')
    setLoading(true)
    scrollToEnd()

    const today = getTodayString()

    try {
      const day = diary[today]
      const todayEntries = day
        ? day.entries.map(e => ({
            id: e.id,
            name: e.food.name,
            meal: e.mealType,
            calories: e.food.calories * e.servings,
          }))
        : []
      const todayCalories = todayEntries.reduce((sum, e) => sum + e.calories, 0)
      const displayWeight =
        profile.weightUnit === 'lbs' ? kgToLbs(currentWeightKg) : currentWeightKg

      const reply = await postChat(history, {
        goals: {
          calories: goals.calories,
          protein: goals.protein,
          carbs: goals.carbs,
          fat: goals.fat,
        },
        todayCalories: Math.round(todayCalories),
        todayEntries,
        currentWeight: `${displayWeight.toFixed(1)} ${profile.weightUnit}`,
        weightUnit: profile.weightUnit,
      })

      const logged: LoggedAction[] = []

      for (const action of reply.actions) {
        if (action.tool === 'log_food') {
          const inp = action.input
          // `servings` is validated positive by the API client, so these divisions are safe.
          const food: Food = {
            id: `chat_${uuidv4()}`,
            name: inp.name,
            category: inp.category,
            servingSize: inp.servingSize,
            servingUnit: inp.servingUnit,
            calories: inp.calories / inp.servings,
            protein: inp.protein / inp.servings,
            carbs: inp.carbs / inp.servings,
            fat: inp.fat / inp.servings,
            fiber: inp.fiber / inp.servings,
            sugar: inp.sugar / inp.servings,
            sodium: inp.sodium / inp.servings,
            potassium: 0,
            cholesterol: 0,
            saturatedFat: 0,
            transFat: 0,
            vitaminA: 0,
            vitaminC: 0,
            calcium: 0,
            iron: 0,
            isCustom: true,
          }
          addFoodEntry(today, {
            foodId: food.id,
            food,
            servings: inp.servings,
            mealType: inp.meal,
          })
          logged.push({
            type: 'food',
            label: inp.name,
            value: Math.round(inp.calories),
            unit: 'kcal',
            macros: { protein: inp.protein, carbs: inp.carbs, fat: inp.fat },
          })
        }

        if (action.tool === 'remove_food') {
          // A silent correction step — no chip, the assistant's own text explains it.
          removeFoodEntry(today, action.input.entry_id)
        }

        if (action.tool === 'log_weight') {
          const inp = action.input
          /*
            The store writes `weight` verbatim and derives currentWeightKg from it using
            profile.weightUnit. The model reports whichever unit the user spoke in, so
            handing it over unconverted would file a pound value as kilograms — a silent
            2.2x error that then poisons every TDEE and trend built on top of it.
          */
          const weightInProfileUnit =
            inp.unit === profile.weightUnit
              ? inp.weight
              : inp.unit === 'lbs'
                ? lbsToKg(inp.weight)
                : kgToLbs(inp.weight)
          addWeightEntry({ date: today, weight: weightInProfileUnit, bodyFat: inp.bodyFat })
          logged.push({
            type: 'weight',
            label: 'Weight',
            value: weightInProfileUnit,
            unit: profile.weightUnit,
          })
        }

        if (action.tool === 'log_water') {
          const ml = Math.round(action.input.amount_ml)
          addWater(today, ml)
          logged.push({ type: 'water', label: 'Water', value: ml, unit: 'ml' })
        }
      }

      if (logged.length > 0) updateStreak()

      setMessages(prev => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          text: reply.text.trim().length > 0 ? reply.text : 'Done.',
          actions: logged,
          discarded: reply.discardedActions,
        },
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      setMessages(prev => [
        ...prev,
        { id: uuidv4(), role: 'assistant', text: message, failed: true },
      ])
    } finally {
      setLoading(false)
      scrollToEnd()
    }
  }

  return (
    <Screen
      title="Assistant"
      subtitle="Log food, weight and water by describing it"
      right={
        <IconButton accessibilityLabel="Close assistant" onPress={() => router.back()}>
          <X size={20} color={theme.text} strokeWidth={2} />
        </IconButton>
      }
      scroll={false}
      contentStyle={{ flex: 1, paddingHorizontal: 0, gap: 0 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: spacing.lg,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
        >
          {messages.map(message => {
            const mine = message.role === 'user'
            return (
              <View
                key={message.id}
                style={{
                  flexDirection: mine ? 'row-reverse' : 'row',
                  gap: spacing.sm,
                  alignItems: 'flex-start',
                }}
              >
                <Avatar role={message.role} theme={theme} />

                <View
                  style={{
                    flex: 1,
                    gap: spacing.sm,
                    alignItems: mine ? 'flex-end' : 'flex-start',
                  }}
                >
                  {/* Role is carried by side, by surface and by the avatar icon — three
                      signals, so it survives without color. */}
                  <View
                    accessible
                    accessibilityLabel={`${mine ? 'You said' : 'Assistant said'}: ${message.text}`}
                    style={{
                      maxWidth: '92%',
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: radius.control,
                      borderTopRightRadius: mine ? 4 : radius.control,
                      borderTopLeftRadius: mine ? radius.control : 4,
                      backgroundColor: mine ? theme.brand : theme.surface,
                      borderWidth: StyleSheet.hairlineWidth * 2,
                      borderColor: mine ? theme.brand : theme.border,
                    }}
                  >
                    {message.failed ? (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
                        <View style={{ marginTop: 2 }}>
                          <AlertTriangle size={16} color={theme.status.critical} strokeWidth={2.2} />
                        </View>
                        <Body size={14} style={{ flex: 1, color: theme.status.critical }}>
                          {`Failed: ${message.text}`}
                        </Body>
                      </View>
                    ) : (
                      <Body size={14} style={{ color: mine ? theme.brandOn : theme.text }}>
                        {message.text}
                      </Body>
                    )}
                  </View>

                  {message.actions && message.actions.length > 0 ? (
                    <Surface
                      radius={radius.control}
                      style={{ alignSelf: 'stretch', padding: spacing.md, gap: spacing.md }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Check size={12} color={theme.status.good} strokeWidth={2.6} />
                        <Label style={{ color: theme.status.good }}>Logged</Label>
                      </View>

                      {message.actions.map((action, index) => {
                        const Icon = actionIcon(action.type)
                        return (
                          <View key={`${message.id}-${index}`} style={{ gap: 6 }}>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: spacing.sm,
                              }}
                            >
                              <Icon size={14} color={theme.textMuted} strokeWidth={2} />
                              <Body
                                size={13}
                                weight="semibold"
                                numberOfLines={1}
                                style={{ flex: 1 }}
                              >
                                {action.label}
                              </Body>
                              <StatValue size={15}>{formatValue(action.value)}</StatValue>
                              <Body size={11} tone="muted" weight="medium">
                                {action.unit}
                              </Body>
                            </View>

                            {action.macros ? (
                              <View
                                style={{
                                  flexDirection: 'row',
                                  flexWrap: 'wrap',
                                  gap: 6,
                                  paddingLeft: 22,
                                }}
                              >
                                <MacroChip
                                  name="Protein"
                                  grams={action.macros.protein}
                                  color={theme.macro.protein}
                                  theme={theme}
                                />
                                <MacroChip
                                  name="Carbs"
                                  grams={action.macros.carbs}
                                  color={theme.macro.carbs}
                                  theme={theme}
                                />
                                <MacroChip
                                  name="Fat"
                                  grams={action.macros.fat}
                                  color={theme.macro.fat}
                                  theme={theme}
                                />
                              </View>
                            ) : null}
                          </View>
                        )
                      })}
                    </Surface>
                  ) : null}

                  {/* The model claimed to log something the client refused. Say so. */}
                  {message.discarded !== undefined && message.discarded > 0 ? (
                    <View
                      style={{
                        alignSelf: 'stretch',
                        flexDirection: 'row',
                        gap: spacing.sm,
                        alignItems: 'flex-start',
                        borderRadius: radius.control,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: theme.border,
                        padding: spacing.md,
                      }}
                    >
                      <View style={{ marginTop: 2 }}>
                        <AlertTriangle size={16} color={theme.status.warning} strokeWidth={2.2} />
                      </View>
                      <Body size={13} style={{ flex: 1, color: theme.status.warning }}>
                        {`Not saved: ${message.discarded} ${message.discarded === 1 ? 'item was' : 'items were'} missing a name, a serving count or a weight unit, so ${message.discarded === 1 ? 'it was' : 'they were'} not written to your diary. Say it again with the amount and I will retry.`}
                      </Body>
                    </View>
                  ) : null}
                </View>
              </View>
            )
          })}

          {loading ? (
            <View
              style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
              accessibilityRole="progressbar"
              accessibilityLabel="The assistant is thinking"
            >
              <Avatar role="assistant" theme={theme} />
              <Surface
                radius={radius.control}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <ActivityIndicator color={theme.textMuted} />
                <Body size={13} tone="muted" weight="medium">
                  Thinking…
                </Body>
              </Surface>
            </View>
          ) : null}
        </ScrollView>

        {/* Frosted composer: the conversation scrolls underneath it, so a solid bar
            would look pasted on. Same material as the header and the tab bar. */}
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: theme.glass.border,
            overflow: 'hidden',
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            gap: spacing.md,
          }}
        >
          <BlurView
            tint={theme.glass.tint}
            intensity={theme.glass.intensity + 20}
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.overlay }]} />
          <Button
            label="Suggest a meal"
            variant="secondary"
            onPress={() => setInput('What should I eat to hit my remaining macros today?')}
            disabled={loading}
            icon={<Lightbulb size={14} color={theme.text} strokeWidth={2} />}
          />

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Field
                value={input}
                onChangeText={setInput}
                placeholder="What did you eat?"
                accessibilityLabel="Message the nutrition assistant"
                editable={!loading}
                // Multiline on purpose: "I had a cup of oatmeal and two eggs for
                // breakfast" is a normal message and must not scroll off sideways.
                // Return therefore inserts a newline; Send is the only commit.
                multiline
                style={{ maxHeight: HIT_SIZE * 3, paddingTop: 12, paddingBottom: 12 }}
              />
            </View>
            <Button
              label="Send"
              onPress={() => void send()}
              disabled={input.trim().length === 0}
              loading={loading}
              haptic
              icon={<Send size={15} color={theme.brandOn} strokeWidth={2.2} />}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}
