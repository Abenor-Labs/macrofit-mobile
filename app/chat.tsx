import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  Camera,
  Check,
  Droplets,
  ImageIcon,
  Lightbulb,
  RotateCcw,
  Scale,
  Send,
  Sparkles,
  User,
  Utensils,
  X,
} from 'lucide-react-native'

import type { Food, MealType } from '@core/types'
import { getDayNutrition, getTodayString, kgToLbs, lbsToKg } from '@core/utils/calculations'
import {
  postAnalyzePhoto,
  postChat,
  type AnalyzedFood,
  type ChatMessageParam,
} from '@/lib/api'
import { analyzedFoodToFood, mealForNow } from '@/lib/analyzedFood'
import { capturePhoto, type PhotoSource } from '@/lib/mealPhoto'
import { PhotoReview, type PhotoReviewSelection } from '@/components/PhotoReview'
import { useStore } from '@/store/useStore'
import { useAuth } from '@/lib/AuthProvider'
import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'
import { RichText } from '@/components/RichText'
import { Button, IconButton } from '@/components/Button'
import { ActionSheet } from '@/components/ActionSheet'
import { EmptyState, Field, Screen } from '@/components/Layout'

/**
 * The nutrition assistant, ported from the web `ChatInterface`.
 *
 * Same context, same tools, same store mutations. It also owns the meal-photo path, which
 * the web app never shipped a screen for: the camera button in the composer sends an image
 * to `/api/analyze-photo` — a vision model, not the tool-calling one behind the text — and
 * renders the result as a card the user confirms before anything is written.
 *
 * Two things are handled more carefully than on the web because they are silent data
 * corruption otherwise:
 *   - a weight the model reports in a unit the profile does not use is converted before
 *     it is written (see `weightInProfileUnit`);
 *   - `discardedActions` is surfaced, so a reply that says "logged it" while the payload
 *     was thrown away does not read as a clean success.
 */

const WELCOME_ID = 'welcome'

const WELCOME_TEXT =
  "Hi! I'm your nutrition assistant. Tell me what you ate, your weight, or your water and I'll log it. Try \"I had 1 cup of oatmeal and 2 eggs for breakfast\" or \"I weighed 84 kg this morning\". You can also photograph a meal with the camera button and I'll read the plate."

/** A store mutation that actually landed, echoed back so the user can verify it. */
interface LoggedAction {
  type: 'food' | 'weight' | 'water'
  label: string
  value: number
  unit: string
  /*
    The food this action created, so the write can be reversed. `addFoodEntry` mints the entry
    id internally and returns nothing, but every chat-created Food gets a unique `chat_<uuid>`,
    which is enough to find the entry again in the day it landed in.
  */
  foodId?: string
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
  /** The user text that triggered this failed turn, so a retry can re-send it. */
  retryText?: string
  /** Local URI of an attached meal photo, shown in place of a text bubble. */
  photo?: string
  /**
   * Vision results awaiting the user's confirmation.
   *
   * Cleared when the card's Log button writes them, at which point the same message grows
   * `actions` instead — so the card becomes the ordinary receipt, with the ordinary Undo.
   */
  review?: AnalyzedFood[]
  /**
   * Excludes this turn from the history sent to `/api/chat`.
   *
   * A photo turn has no text of its own, and `send` maps every surviving message straight
   * into `{ role, content: m.text }` — so without this flag the next text message would push
   * an empty user turn at the model. The photo endpoint is stateless and separate, and what a
   * photo logged still reaches the assistant through `todayEntries`, so nothing is lost.
   */
  fromPhoto?: boolean
}

/**
 * Edge of the attached-photo thumbnail.
 *
 * Square and fixed rather than sized to the image: a transcript of portrait and landscape
 * meals at their own aspect ratios reads as a jumble, and a tall photo pushes the review
 * card it belongs with off the screen.
 */
const PHOTO_BUBBLE = 168

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

/**
 * Plain words for a failed request. The raw message used to be printed verbatim, so a lost
 * connection read "Failed: Network request failed" — true, and useless to act on.
 */
const friendlyError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : ''
  if (/network request failed|failed to fetch|timed? ?out|abort/i.test(raw)) {
    return "Couldn't reach the assistant. Check your connection and try again."
  }
  return raw.trim().length > 0 ? raw : 'Something went wrong. Try again.'
}

export default function ChatScreen() {
  const { user } = useAuth()
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
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)
  const [messages, setMessages] = useState<ChatEntry[]>([
    { id: WELCOME_ID, role: 'assistant', text: WELCOME_TEXT },
  ])

  const scrollRef = useRef<ScrollView>(null)
  const scrollToEnd = useCallback(() => {
    // Deferred a frame: the new bubble has not been laid out when setState returns.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }))
  }, [])

  /*
    Turns whose writes have been reversed. The card stays on screen saying so rather than
    disappearing: the conversation above it still reads "I logged that", and a card that
    vanished would leave the user unsure whether the undo worked or the app forgot.
  */
  const [undone, setUndone] = useState<Record<string, true>>({})

  /*
    Reverses what a single reply wrote.

    The assistant decides on the server which tools to call, and this screen applies every one
    of them without asking — so a question phrased as "if I ate four eggs, what would that
    cost me?" can be answered by logging four eggs. That judgement cannot be fixed from here.
    What can be fixed is that the write was one-way.

    Food is found by the chat-minted food id rather than an entry id, because addFoodEntry
    generates the entry id internally and hands nothing back. Water reverses by adding a
    negative amount, which is what the water card's own minus button does. Weight is
    deliberately not reversed: a weigh-in is a single editable row the user can see in the
    weight log, and silently deleting body-weight history is worse than leaving one wrong
    number visible.
  */
  const undoTurn = (message: ChatEntry) => {
    const day = useStore.getState().diary[getTodayString()]

    for (const action of message.actions ?? []) {
      if (action.type === 'food' && action.foodId) {
        const entry = day?.entries.find(e => e.food.id === action.foodId)
        if (entry) removeFoodEntry(getTodayString(), entry.id)
      }
      if (action.type === 'water') addWater(getTodayString(), -action.value)
    }

    setUndone(prev => ({ ...prev, [message.id]: true }))
  }

  /*
    Puts a failed turn back the way it was before it was sent.

    Both messages go, not just the failed reply: the user's bubble is still in `messages`, and
    `send` rebuilds history from whatever survives, so leaving it would send the same user turn
    to the model twice and show it twice in the transcript.
  */
  const retry = (failedMessageId: string, retryText: string) => {
    if (loading) return
    setMessages(prev => {
      const index = prev.findIndex(m => m.id === failedMessageId)
      if (index === -1) return prev
      const previous = prev[index - 1]
      const from = previous?.role === 'user' ? index - 1 : index
      return [...prev.slice(0, from), ...prev.slice(index + 1)]
    })
    setInput(retryText)
    scrollToEnd()
  }

  const send = async () => {
    const text = input.trim()
    if (text.length === 0 || loading) return

    const history: ChatMessageParam[] = messages
      // A failed turn is this client's error string, not something the assistant said. Sending
      // it back would tell the model it had replied "Network request failed". A photo turn is
      // skipped for the reason on `fromPhoto`.
      .filter(m => m.id !== WELCOME_ID && !m.failed && !m.fromPhoto)
      .map(m => ({ role: m.role, content: m.text }))
    history.push({ role: 'user', content: text })

    setMessages(prev => [...prev, { id: uuidv4(), role: 'user', text }])
    setInput('')
    setLoading(true)
    scrollToEnd()

    const today = getTodayString()

    try {
      const day = diary[today]
      /*
        Macros travel with every entry, and the day's totals travel alongside them.

        This used to send `{id, name, meal, calories}` and nothing else, so the assistant was
        answering "how much protein have I got left" from food names alone. It estimated, said
        so, and was wrong — while `e.food.protein` sat one property away, already exact, already
        rendered on the dashboard. The model was never the problem; it was never told.
      */
      const todayEntries = day
        ? day.entries.map(e => ({
            id: e.id,
            name: e.food.name,
            meal: e.mealType,
            calories: Math.round(e.food.calories * e.servings),
            protein: Math.round(e.food.protein * e.servings),
            carbs: Math.round(e.food.carbs * e.servings),
            fat: Math.round(e.food.fat * e.servings),
          }))
        : []
      // The same function the diary and dashboard total with, so all three agree.
      const totals = getDayNutrition(day ?? { date: today, entries: [], waterIntake: 0, exercises: [] })
      const todayCalories = totals.calories
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
        consumed: {
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fat: Math.round(totals.fat),
          fiber: Math.round(totals.fiber),
        },
        todayEntries,
        currentWeight: `${displayWeight.toFixed(1)} ${profile.weightUnit}`,
        weightUnit: profile.weightUnit,
      })

      const logged: LoggedAction[] = []

      for (const action of reply.actions) {
        if (action.tool === 'log_food') {
          const inp = action.input
          const food: Food = analyzedFoodToFood(inp, `chat_${uuidv4()}`)
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
            foodId: food.id,
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
      const message = friendlyError(err)
      setMessages(prev => [
        ...prev,
        { id: uuidv4(), role: 'assistant', text: message, failed: true, retryText: text },
      ])
    } finally {
      setLoading(false)
      scrollToEnd()
    }
  }

  /*
    Photographs a meal, reads it, and puts the reading in the transcript for confirmation.

    The photo bubble is appended BEFORE the request so the wait has something to happen
    against — an 18-second model call behind a motionless screen reads as a hang. Both the
    bubble and whatever comes back carry `fromPhoto`; the note on that field says why.

    `/api/analyze-photo` is a different model from `/api/chat` — vision rather than
    tool-calling — and it is given no conversation, so nothing here touches `history`.
  */
  const runPhoto = async (source: PhotoSource) => {
    if (loading) return

    let capture
    try {
      capture = await capturePhoto(source)
    } catch (err: unknown) {
      // Resize or encode failed. Nothing is on screen yet, so an alert is the whole story.
      Alert.alert(
        'Could not prepare that photo',
        err instanceof Error ? err.message : 'Try taking it again.',
      )
      return
    }

    if (capture.status === 'canceled') return
    if (capture.status === 'denied') {
      Alert.alert(
        'Camera access is off',
        'Allow the camera in Settings to photograph a meal. Choosing an existing photo from your library still works.',
      )
      return
    }

    const { uri, base64 } = capture.photo
    setMessages(prev => [
      ...prev,
      { id: uuidv4(), role: 'user', text: '', photo: uri, fromPhoto: true },
    ])
    setLoading(true)
    scrollToEnd()

    /*
      The clock picks the meal, not the user — and only as the card's starting position.
      Sending it on to the model as well is worth doing: the same beige plate is a different
      set of foods at 8am than at 9pm, and `mealType` is the only context this endpoint gets.
    */
    const meal = mealForNow()

    try {
      const foods = await postAnalyzePhoto(base64, meal)

      setMessages(prev => [
        ...prev,
        foods.length === 0
          ? {
              id: uuidv4(),
              role: 'assistant',
              // An empty array is a valid 200, not a failure — so it is not styled as one.
              text: "I couldn't make out any food in that one. A closer shot of the plate, in better light, usually does it.",
              fromPhoto: true,
            }
          : {
              id: uuidv4(),
              role: 'assistant',
              text: 'Here is what I can see. Check it over before I log it.',
              review: foods,
              fromPhoto: true,
            },
      ])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong.'
      /*
        No `retryText`: a retry would have to re-send an image this screen no longer holds,
        and re-picking it is exactly what the camera button in the composer already does.
      */
      setMessages(prev => [
        ...prev,
        { id: uuidv4(), role: 'assistant', text: message, failed: true, fromPhoto: true },
      ])
    } finally {
      setLoading(false)
      scrollToEnd()
    }
  }

  /**
   * Asks where the photo should come from, in the app's own sheet.
   *
   * This used to be ActionSheetIOS on iOS and a three-button Alert on Android. The Android one
   * is the system's stock dialog — platform grey, uppercase buttons stacked to the right, and a
   * hole where the message goes — which read as an error rather than a choice.
   */
  const attachPhoto = () => {
    if (loading) return
    setPhotoSheetOpen(true)
  }

  /*
    Writes the items the user kept, then turns the card back into an ordinary receipt.

    Replacing `review` with `actions` on the SAME message is what earns the existing Undo:
    the receipt renderer and `undoTurn` already work on any turn carrying `actions`, and a
    photo log reverses by the same route a text log does.
  */
  const logReviewed = (
    messageId: string,
    selection: PhotoReviewSelection[],
    meal: MealType,
  ) => {
    const today = getTodayString()
    const logged: LoggedAction[] = []

    for (const { food: analyzed, servings } of selection) {
      const food: Food = analyzedFoodToFood(analyzed, `photo_${uuidv4()}`)
      addFoodEntry(today, { foodId: food.id, food, servings, mealType: meal })

      /*
        The receipt reports what was WRITTEN, not what was detected. The stepper can move a
        count away from the model's, and a chip claiming 248 kcal next to a diary row holding
        372 is the kind of quiet disagreement that makes the whole feature untrustworthy.
      */
      const scale = servings / analyzed.servings
      logged.push({
        type: 'food',
        label: analyzed.name,
        value: Math.round(analyzed.calories * scale),
        unit: 'kcal',
        foodId: food.id,
        macros: {
          protein: analyzed.protein * scale,
          carbs: analyzed.carbs * scale,
          fat: analyzed.fat * scale,
        },
      })
    }

    if (logged.length > 0) updateStreak()

    setMessages(prev =>
      prev.map(message =>
        message.id === messageId
          ? {
              ...message,
              review: undefined,
              text: `Logged ${logged.length === 1 ? '1 item' : `${logged.length} items`} to ${meal}.`,
              actions: logged,
            }
          : message,
      ),
    )
    scrollToEnd()
  }

  /*
    THE ONE FEATURE THAT GENUINELY NEEDS AN ACCOUNT.

    Everything else in this app runs on the phone, so asking for a password anywhere else
    would be a toll gate with nothing behind it. This is different: every message here is a
    model call billed to whoever owns the deployment, and an app that lets anonymous users
    spend that without limit is a bill waiting to happen.

    Two things this is NOT:

      - It is not security. `src/lib/api.ts` sends no credential, so the endpoints remain
        callable by anyone who knows the URL, with or without this screen. The real fix is a
        token check on the server and it lives in the API repo, not here.
      - It is not an argument for gating anything else. Diary, workouts, weigh-ins, targets
        and charts cost nothing to run and stay open.

    What it does do is stop the app's own users running up a bill anonymously, which is worth
    having on its own and is exactly the rule this app is meant to follow: ask for an account
    at the moment one is genuinely required, and not a screen earlier.
  */
  if (user === null) {
    return (
      <Screen
        title="Assistant"
        right={
          <IconButton accessibilityLabel="Close assistant" onPress={() => router.back()}>
            <X size={20} color={theme.text} strokeWidth={2} />
          </IconButton>
        }
      >
        <EmptyState
          icon={<Sparkles size={24} color={theme.brandText} strokeWidth={2} />}
          title="The coach needs an account"
          message="It reads your diary and weight history to answer, and every reply is generated for you specifically. Everything else in the app keeps working without one."
          action={
            <Button label="Sign in or create an account" onPress={() => router.push('/login')} />
          }
        />
      </Screen>
    )
  }

  return (
    <Screen
      title="Assistant"
      subtitle="Describe a meal or photograph it"
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
                  {message.photo ? (
                    /* The photo replaces the text bubble rather than sitting inside one —
                       there is no text on a photo turn, and an empty pane under the image
                       would read as a failed render. */
                    <Image
                      accessible
                      accessibilityLabel="The meal photo you sent"
                      source={{ uri: message.photo }}
                      resizeMode="cover"
                      style={{
                        width: PHOTO_BUBBLE,
                        height: PHOTO_BUBBLE,
                        borderRadius: radius.control,
                        borderTopRightRadius: 4,
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: theme.border,
                        backgroundColor: theme.surface,
                      }}
                    />
                  ) : (
                    /* Role is carried by side, by surface and by the avatar icon — three
                       signals, so it survives without color. */
                    <View
                      accessible={!message.failed}
                      accessibilityLabel={
                        message.failed
                          ? undefined
                          : `${mine ? 'You said' : 'Assistant said'}: ${message.text}`
                      }
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
                        <View style={{ gap: spacing.sm }}>
                          <View
                            accessible
                            accessibilityLabel={`Assistant failed: ${message.text}`}
                            style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}
                          >
                            <View style={{ marginTop: 2 }}>
                              <AlertTriangle size={16} color={theme.status.critical} strokeWidth={2.2} />
                            </View>
                            <Body size={14} style={{ flex: 1, color: theme.status.critical }}>
                              {message.text}
                            </Body>
                          </View>
                          {message.retryText ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Retry this message"
                              onPress={() => retry(message.id, message.retryText!)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                gap: 4,
                                minHeight: HIT_SIZE,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                borderRadius: radius.pill,
                                borderWidth: StyleSheet.hairlineWidth * 2,
                                borderColor: theme.border,
                              }}
                            >
                              <RotateCcw size={12} color={theme.textSecondary} strokeWidth={2.2} />
                              <Body size={12} weight="medium" style={{ color: theme.textSecondary }}>
                                Retry
                              </Body>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : (
                        <RichText
                          text={message.text}
                          color={mine ? theme.brandOn : theme.text}
                        />
                      )}
                    </View>
                  )}

                  {message.review ? (
                    <View style={{ alignSelf: 'stretch' }}>
                      <PhotoReview
                        foods={message.review}
                        initialMeal={mealForNow()}
                        disabled={loading}
                        onLog={(selection, meal) => logReviewed(message.id, selection, meal)}
                        onRetake={attachPhoto}
                      />
                    </View>
                  ) : null}

                  {message.actions && message.actions.length > 0 ? (
                    <Surface
                      radius={radius.control}
                      style={{ alignSelf: 'stretch', padding: spacing.md, gap: spacing.md }}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {undone[message.id] ? (
                          <>
                            <X size={12} color={theme.textMuted} strokeWidth={2.6} />
                            <Label style={{ flex: 1, color: theme.textMuted }}>Removed</Label>
                          </>
                        ) : (
                          <>
                            <Check size={12} color={theme.status.good} strokeWidth={2.6} />
                            <Label style={{ flex: 1, color: theme.status.good }}>Logged</Label>
                            {/* The assistant writes to the diary on its own judgement of what
                                the message meant. When it reads a question as an instruction,
                                this is the way back. */}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Remove what this reply logged"
                              onPress={() => undoTurn(message)}
                              style={styles.undo}
                            >
                              <Body size={13} weight="semibold" style={{ color: theme.brandText }}>
                                Undo
                              </Body>
                            </Pressable>
                          </>
                        )}
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
          {/* No blurMethod on purpose: the composer is inside the same content view the chrome
              blurs, and a BlurView cannot sample a target it is itself part of. The overlay
              below carries the material instead. */}
          <BlurView
            tint={theme.glass.tint}
            intensity={theme.glass.intensity + 20}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.glass.overlay }]} />
          {/* A starter, not furniture: it sat above the composer on every turn, costing a
              row of the transcript for a prompt most people use once. It shows until the
              conversation has started. */}
          {messages.length <= 1 ? (
            <Button
              label="Suggest a meal"
              variant="secondary"
              onPress={() => setInput('What should I eat to hit my remaining macros today?')}
              disabled={loading}
              icon={<Lightbulb size={14} color={theme.text} strokeWidth={2} />}
            />
          ) : null}

          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
            {/* Bordered rather than bare: an IconButton is invisible until pressed, which is
                right for chrome and wrong for the only entry point a whole feature has. */}
            <IconButton
              accessibilityLabel="Add a meal photo"
              onPress={attachPhoto}
              disabled={loading}
              style={{
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: theme.border,
                borderRadius: radius.control,
              }}
            >
              <Camera size={19} color={theme.text} strokeWidth={2} />
            </IconButton>
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

      <ActionSheet
        visible={photoSheetOpen}
        title="Add a meal photo"
        onClose={() => setPhotoSheetOpen(false)}
        options={[
          {
            label: 'Take photo',
            icon: <Camera size={20} color={theme.brandText} strokeWidth={2} />,
            onPress: () => void runPhoto('camera'),
          },
          {
            label: 'Choose from library',
            icon: <ImageIcon size={20} color={theme.brandText} strokeWidth={2} />,
            onPress: () => void runPhoto('library'),
          },
        ]}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  /* Static rather than a style function: the pressed-state form is what silently lost its
     styles twice in this codebase, and there is no reason to reintroduce the shape. */
  undo: {
    minHeight: HIT_SIZE,
    minWidth: HIT_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
})
