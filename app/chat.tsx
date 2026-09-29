import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller'
import { useRouter } from 'expo-router'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { v4 as uuidv4 } from 'uuid'
import {
  AlertTriangle,
  Bot,
  Brain,
  CalendarCheck,
  Eraser,
  Target,
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

import type { MealType } from '@core/types'
import { getTodayString, kgToLbs, lbsToKg } from '@core/utils/calculations'
import { postAnalyzePhoto, postChat, type ChatMessageParam } from '@/lib/api'
import { mealForNow } from '@/lib/analyzedFood'
import { buildChatContext, loggedDaysLastWeek } from '@/lib/coachContext'
import { buildOpener } from '@/lib/coachOpener'
import { addEntriesTracked, foodForItem } from '@/lib/coachWrites'
import { formatNumber } from '@/lib/formatNumber'
import {
  useCoachStore,
  type ChatEntry,
  type LoggedAction,
  type MealOffer,
  type TargetProposal,
} from '@/store/coachStore'
import { capturePhoto, type PhotoSource } from '@/lib/mealPhoto'
import { appAlert } from '@/components/AppAlert'
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
 * The coach. Ported from the web `ChatInterface`, then rebuilt around what a coach needs:
 * it sees two weeks of diary, the weight trend and the plan with every message
 * (`buildChatContext`), keeps the conversation and what it was told to remember
 * (`useCoachStore`), opens each day with where things stand and a meal idea
 * (`buildOpener`), and can put a meal or new targets in front of the user as a card to accept.
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

/** History turns sent with each message. The server keeps the most recent of these. */
const HISTORY_TURNS = 24

/** A check-in needs about a week since the last one, and a week with something in it. */
const CHECK_IN_EVERY_MS = 6.5 * 86_400_000
const CHECK_IN_MIN_DAYS = 3

const isSameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

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
  <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: color }} />
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
    <Body size={11} tone="muted">
      g
    </Body>
  </View>
)

const Avatar: React.FC<{ role: ChatEntry['role']; theme: Theme }> = ({ role, theme }) => (
  <View
    style={{
      width: 28,
      height: 28,
      borderRadius: radius.pill,
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

const baseName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '')

/**
 * A meal the coach suggested, with the app's own totals and one button to log it.
 *
 * The numbers here are summed from catalog rows, never taken from the reply text: the model
 * is told not to state totals, because its arithmetic did not match the diary's.
 */
const OfferCard: React.FC<{
  offer: MealOffer
  theme: Theme
  disabled: boolean
  onLog: () => void
}> = ({ offer, theme, disabled, onLog }) => {
  const kcal = offer.items.reduce((sum, item) => sum + item.calories, 0)
  const protein = offer.items.reduce((sum, item) => sum + item.protein, 0)
  return (
    <Surface radius={radius.control} style={{ alignSelf: 'stretch', padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Utensils size={13} color={theme.brandText} strokeWidth={2.2} />
        <Label style={{ flex: 1, color: theme.brandText }}>{`${offer.meal} idea`}</Label>
      </View>
      {offer.items.map((item, index) => (
        <View key={`${item.foodId}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Body size={15} style={{ flex: 1 }} numberOfLines={1}>
            {item.servings === 1 ? baseName(item.name) : `${baseName(item.name)} ×${item.servings}`}
          </Body>
          <StatValue size={13} tone="secondary">{String(item.calories)}</StatValue>
          <Body size={11} tone="muted">kcal</Body>
        </View>
      ))}
      <Body size={13} tone="secondary">
        {`${formatNumber(Math.round(kcal))} kcal · ${Math.round(protein)} g protein`}
      </Body>
      {offer.loggedAt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Check size={12} color={theme.status.good} strokeWidth={2.6} />
          <Label style={{ color: theme.status.good }}>Logged below</Label>
        </View>
      ) : (
        <Button label="Log this" onPress={onLog} disabled={disabled} haptic />
      )}
    </Surface>
  )
}

/** New daily targets the coach proposed. Applied only on a tap, and reversible. */
const ProposalCard: React.FC<{
  proposal: TargetProposal
  theme: Theme
  onApply: () => void
  onRevert: () => void
}> = ({ proposal, theme, onApply, onRevert }) => (
  <Surface radius={radius.control} style={{ alignSelf: 'stretch', padding: spacing.md, gap: spacing.sm }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Target size={13} color={theme.brandText} strokeWidth={2.2} />
      <Label style={{ flex: 1, color: theme.brandText }}>New daily targets</Label>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <StatValue size={24}>{formatNumber(proposal.calories)}</StatValue>
      <Body size={13} tone="secondary">kcal</Body>
    </View>
    <Body size={13} tone="secondary">
      {`Protein ${proposal.protein} g · Carbs ${proposal.carbs} g · Fat ${proposal.fat} g`}
    </Body>
    <Body size={13}>{proposal.reason}</Body>
    {proposal.appliedAt ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Check size={12} color={theme.status.good} strokeWidth={2.6} />
        <Label style={{ flex: 1, color: theme.status.good }}>Applied</Label>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back to the previous targets" onPress={onRevert} style={styles.undo}>
          <Body size={13} weight="semibold" style={{ color: theme.brandText }}>
            Undo
          </Body>
        </Pressable>
      </View>
    ) : (
      <Button label="Apply these targets" onPress={onApply} haptic />
    )}
  </Surface>
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
  const removeFoodEntry = useStore(s => s.removeFoodEntry)
  const updateGoals = useStore(s => s.updateGoals)
  const addWeightEntry = useStore(s => s.addWeightEntry)
  const addWater = useStore(s => s.addWater)
  const updateStreak = useStore(s => s.updateStreak)

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false)
  const keyboardVisible = useKeyboardState(state => state.isVisible)
  const messages = useCoachStore(s => s.messages)
  const setMessages = useCoachStore(s => s.setMessages)
  const memory = useCoachStore(s => s.memory)
  const rememberFact = useCoachStore(s => s.remember)
  const forgetFact = useCoachStore(s => s.forget)
  const lastCheckInAt = useCoachStore(s => s.lastCheckInAt)
  const markCheckIn = useCoachStore(s => s.markCheckIn)
  const clearConversation = useCoachStore(s => s.clearConversation)
  const [memorySheetOpen, setMemorySheetOpen] = useState(false)

  const checkInDue = useMemo(
    () =>
      (lastCheckInAt === null || Date.now() - lastCheckInAt > CHECK_IN_EVERY_MS) &&
      loggedDaysLastWeek(diary) >= CHECK_IN_MIN_DAYS,
    [lastCheckInAt, diary],
  )

  /*
    The coach speaks first, once a day. When the last message is not from today (or there is
    none), the day's opener goes in: where the day stands and, when there is one, a meal idea
    from this person's own history as a card. Written on the phone, so it costs nothing and
    appears instantly.
  */
  useEffect(() => {
    if (user === null) return
    const last = messages[messages.length - 1]
    if (last?.at !== undefined && isSameDay(last.at, Date.now())) return
    const opener = buildOpener({ name: profile.name, diary, goals, checkInDue })
    setMessages(prev => [
      ...prev,
      { id: uuidv4(), role: 'assistant', text: opener.text, offer: opener.offer, local: true, at: Date.now() },
    ])
    // Once per sign-in: re-running on every diary change would stack openers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

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
      if (action.type === 'food' && action.entryIds) {
        for (const id of action.entryIds) removeFoodEntry(getTodayString(), id)
      } else if (action.type === 'food' && action.foodId) {
        // Transcripts saved before entry ids were recorded.
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

  const send = async (override?: string, mode: 'chat' | 'checkin' = 'chat') => {
    const text = (override ?? input).trim()
    if (text.length === 0 || loading) return

    const history: ChatMessageParam[] = messages
      // A failed turn is this client's error string, not something the assistant said. Sending
      // it back would tell the model it had replied "Network request failed". A photo turn is
      // skipped for the reason on `fromPhoto`.
      .filter(m => !m.failed && !m.fromPhoto && m.text.trim().length > 0)
      .slice(-HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.text }))
    history.push({ role: 'user', content: text })

    setMessages(prev => [...prev, { id: uuidv4(), role: 'user', text, at: Date.now() }])
    if (override === undefined) setInput('')
    if (mode === 'checkin') markCheckIn(Date.now())
    setLoading(true)
    scrollToEnd()

    const today = getTodayString()

    try {
      // Two weeks of diary, weights, energy, plan, usual foods and memory, built fresh from
      // the store so a food logged a second ago is already in it.
      const reply = await postChat(
        history,
        buildChatContext(useStore.getState(), useCoachStore.getState().memory, mode),
      )

      const logged: LoggedAction[] = []
      let offer: MealOffer | undefined
      let proposal: TargetProposal | undefined
      const memoryNotes: string[] = []

      for (const action of reply.actions) {
        if (action.tool === 'log_food') {
          const inp = action.input
          const { food, servings } = foodForItem(inp, 'chat')
          const entryIds = addEntriesTracked(today, [{ food, servings, mealType: inp.meal }])
          logged.push({
            type: 'food',
            label: inp.servings === 1 ? inp.name : `${inp.name} ×${inp.servings}`,
            value: Math.round(inp.calories),
            unit: 'kcal',
            entryIds,
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

        // Offers and proposals are shown, never applied: the person taps to accept.
        if (action.tool === 'offer_meal') offer = { meal: action.input.meal, items: action.input.items }
        if (action.tool === 'propose_targets') proposal = { ...action.input }

        if (action.tool === 'remember') {
          rememberFact(action.input.fact)
          memoryNotes.push(`Remembered: ${action.input.fact}`)
        }
        if (action.tool === 'forget') {
          forgetFact(action.input.fact)
          memoryNotes.push(`Forgot: ${action.input.fact}`)
        }
      }

      if (logged.length > 0) updateStreak()

      setMessages(prev => [
        ...prev,
        {
          id: uuidv4(),
          role: 'assistant',
          text: reply.text.trim().length > 0 ? reply.text : 'Done.',
          at: Date.now(),
          actions: logged,
          discarded: reply.discardedActions,
          offer,
          proposal,
          memoryNotes: memoryNotes.length > 0 ? memoryNotes : undefined,
        },
      ])
    } catch (err: unknown) {
      const message = friendlyError(err)
      setMessages(prev => [
        ...prev,
        { id: uuidv4(), role: 'assistant', text: message, failed: true, retryText: text, at: Date.now() },
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
      appAlert(
        'Could not prepare that photo',
        err instanceof Error ? err.message : 'Try taking it again.',
      )
      return
    }

    if (capture.status === 'canceled') return
    if (capture.status === 'denied') {
      appAlert(
        'Camera access is off',
        'Allow the camera in Settings to photograph a meal. Choosing an existing photo from your library still works.',
        [
          { text: 'Not now', style: 'cancel' },
          // Straight to this app's settings page, instead of telling the user to go find it.
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ],
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
      // A catalog match is logged as the catalog food; see foodForItem.
      const { food } = foodForItem(analyzed, 'photo')
      const entryIds = addEntriesTracked(today, [{ food, servings, mealType: meal }])

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
        entryIds,
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
    Logs a meal the coach offered, then turns the card into a receipt on the same message, so
    the ordinary Undo covers it and the offer cannot be logged twice.
  */
  const logOffer = (messageId: string, offer: MealOffer) => {
    const today = getTodayString()
    const logged: LoggedAction[] = []
    const mealType: MealType = (['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Pre-Workout', 'Post-Workout'] as const).includes(
      offer.meal as MealType,
    )
      ? (offer.meal as MealType)
      : mealForNow()
    for (const item of offer.items) {
      const { food, servings } = foodForItem(item, 'chat')
      const entryIds = addEntriesTracked(today, [{ food, servings, mealType }])
      logged.push({
        type: 'food',
        label: item.servings === 1 ? item.name : `${item.name} ×${item.servings}`,
        value: Math.round(item.calories),
        unit: 'kcal',
        entryIds,
        macros: { protein: item.protein, carbs: item.carbs, fat: item.fat },
      })
    }
    updateStreak()
    setMessages(prev =>
      prev.map(message =>
        message.id === messageId
          ? { ...message, offer: { ...offer, loggedAt: Date.now() }, actions: [...(message.actions ?? []), ...logged] }
          : message,
      ),
    )
    scrollToEnd()
  }

  /** Applies proposed targets, keeping the old ones on the card so the change can be undone. */
  const applyProposal = (messageId: string, proposal: TargetProposal) => {
    const previous = { calories: goals.calories, protein: goals.protein, carbs: goals.carbs, fat: goals.fat }
    updateGoals({ calories: proposal.calories, protein: proposal.protein, carbs: proposal.carbs, fat: proposal.fat })
    setMessages(prev =>
      prev.map(message =>
        message.id === messageId ? { ...message, proposal: { ...proposal, appliedAt: Date.now(), previous } } : message,
      ),
    )
  }

  const revertProposal = (messageId: string, proposal: TargetProposal) => {
    if (!proposal.previous) return
    updateGoals(proposal.previous)
    setMessages(prev =>
      prev.map(message =>
        message.id === messageId ? { ...message, proposal: { ...proposal, appliedAt: undefined, previous: undefined } } : message,
      ),
    )
  }

  /*
    Openers for the next message, chosen for the moment rather than fixed: the check-in when
    one is due, the next meal, and the question people actually ask a coach.
  */
  const starters: { label: string; text: string; mode?: 'checkin' }[] = [
    ...(checkInDue ? [{ label: 'Weekly check-in', text: 'Weekly check-in', mode: 'checkin' as const }] : []),
    { label: 'Plan my next meal', text: 'What should I eat for my next meal?' },
    { label: 'How is my week going?', text: 'How is my week going so far?' },
    ...(/lose|cut/i.test(profile.goal) ? [{ label: 'Why is my weight stuck?', text: 'Why is my weight not moving?' }] : []),
  ].slice(0, 3)

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
      title="Coach"
      subtitle="Knows your diary · remembers what you tell it"
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconButton
            accessibilityLabel={`What the coach remembers, ${memory.length} ${memory.length === 1 ? 'fact' : 'facts'}`}
            onPress={() => setMemorySheetOpen(true)}
          >
            <Brain size={20} color={theme.text} strokeWidth={2} />
          </IconButton>
          <IconButton accessibilityLabel="Close the coach" onPress={() => router.back()}>
            <X size={20} color={theme.text} strokeWidth={2} />
          </IconButton>
        </View>
      }
      scroll={false}
      contentStyle={{ flex: 1, paddingHorizontal: 0, gap: 0 }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
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
                            <Body size={15} style={{ flex: 1, color: theme.status.critical }}>
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

                  {message.offer ? (
                    <OfferCard
                      offer={message.offer}
                      theme={theme}
                      disabled={loading}
                      onLog={() => logOffer(message.id, message.offer!)}
                    />
                  ) : null}

                  {message.proposal ? (
                    <ProposalCard
                      proposal={message.proposal}
                      theme={theme}
                      onApply={() => applyProposal(message.id, message.proposal!)}
                      onRevert={() => revertProposal(message.id, message.proposal!)}
                    />
                  ) : null}

                  {message.memoryNotes?.map(note => (
                    <View key={note} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Brain size={12} color={theme.textMuted} strokeWidth={2} />
                      <Body size={12} tone="muted">
                        {note}
                      </Body>
                    </View>
                  ))}

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
            // With the keyboard up, the keyboard is the bottom edge: the home-indicator inset
            // under it would leave a dead band between the composer and the keys.
            paddingBottom: keyboardVisible ? spacing.md : Math.max(insets.bottom, spacing.md),
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
          {/* Quick asks, chosen for the moment (a due check-in comes first). Hidden while typing
              and while a reply is on its way, so they never compete with the message itself. */}
          {!loading && input.length === 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.sm }}
            >
              {starters.map(starter => (
                <Pressable
                  key={starter.label}
                  accessibilityRole="button"
                  accessibilityLabel={starter.label}
                  onPress={() => void send(starter.text, starter.mode ?? 'chat')}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: radius.pill,
                    borderWidth: StyleSheet.hairlineWidth * 2,
                    borderColor: starter.mode === 'checkin' ? theme.brand : theme.border,
                    backgroundColor: pressed ? theme.border : 'transparent',
                  })}
                >
                  {starter.mode === 'checkin' ? (
                    <CalendarCheck size={14} color={theme.brandText} strokeWidth={2} />
                  ) : (
                    <Lightbulb size={14} color={theme.textSecondary} strokeWidth={2} />
                  )}
                  <Body size={13} weight="medium" style={{ color: starter.mode === 'checkin' ? theme.brandText : theme.textSecondary }}>
                    {starter.label}
                  </Body>
                </Pressable>
              ))}
            </ScrollView>
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
                placeholder="What did you eat? Ask anything"
                accessibilityLabel="Message the coach"
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

      {/* What the coach remembers, each fact one tap from forgotten, and a way to start over.
          Shown because a memory nobody can see or correct is a memory nobody should trust. */}
      <ActionSheet
        visible={memorySheetOpen}
        title="What the coach remembers"
        message={
          memory.length === 0
            ? 'Nothing yet. Tell it things like "I\'m vegetarian" or "I train at 7am" and it will keep them.'
            : 'Tap a fact to forget it.'
        }
        onClose={() => setMemorySheetOpen(false)}
        options={[
          ...memory.map(fact => ({
            label: fact,
            icon: <Brain size={20} color={theme.brandText} strokeWidth={2} />,
            onPress: () => forgetFact(fact),
          })),
          {
            label: 'Clear the conversation',
            icon: <Eraser size={20} color={theme.status.critical} strokeWidth={2} />,
            destructive: true,
            onPress: () => clearConversation(),
          },
        ]}
      />

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
