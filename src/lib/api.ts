import type {
  BodyComposition,
  CoachAlert,
  FoodCategory,
  MacroGoals,
  MealType,
  PhaseType,
  Recommendation,
  TdeeEstimate,
  UserProfile,
} from '@core/types'
import { requireApiUrl } from './env'

/**
 * Typed client for the AI endpoints in `../../api/`.
 *
 * The web app calls these with relative paths; native has no origin to be relative to, so
 * every call is absolute against `EXPO_PUBLIC_API_URL`.
 *
 * Everything coming back is treated as untrusted. Two of the three endpoints return values
 * an LLM produced, and a NaN or Infinity written into the diary is permanent corruption
 * the user has to hunt down by hand — so each reply is validated field by field, and
 * anything unusable is dropped rather than rendered.
 */

// --- Timeouts ---------------------------------------------------------------
// A mobile radio stalls rather than failing: a request to an unreachable LAN address can
// hang for minutes before the OS gives up. Every call is capped.

/** Chat makes two model round-trips (tool calls, then the closing summary). */
const CHAT_TIMEOUT_MS = 45_000

/** Vision over a ~1 MB base64 upload is the slowest call in the app. */
const PHOTO_TIMEOUT_MS = 60_000

/** Matches the web client; the server itself gives up on the model at 20s. */
const RECOMMEND_TIMEOUT_MS = 30_000

// --- Wire types -------------------------------------------------------------

/** One turn of conversation history, as `api/chat.ts` expects it. */
export interface ChatMessageParam {
  role: 'user' | 'assistant'
  content: string
}

/** Calorie and macro targets shown to the model as the user's goals. */
export interface ChatContextGoals {
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** A diary entry already logged today, listed so the model can dedupe and correct. */
export interface ChatContextEntry {
  id: string
  name: string
  meal: string
  calories: number
}

/** Ground truth the chat prompt is built from. Every field is optional server-side. */
export interface ChatContext {
  goals?: ChatContextGoals
  todayCalories?: number
  todayEntries?: ChatContextEntry[]
  currentWeight?: string
  weightUnit?: 'lbs' | 'kg'
}

/** One food the model estimated, with macros totalled for `servings` servings. */
export interface AnalyzedFood {
  name: string
  servings: number
  servingSize: number
  servingUnit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  sodium: number
  category: FoodCategory
}

/** `log_food` payload: an analyzed food plus the meal it belongs to. */
export interface LogFoodInput extends AnalyzedFood {
  meal: MealType
}

/** `log_weight` payload. */
export interface LogWeightInput {
  weight: number
  unit: 'lbs' | 'kg'
  bodyFat?: number
}

/** `log_water` payload. */
export interface LogWaterInput {
  amount_ml: number
}

/** `remove_food` payload; `entry_id` comes from `ChatContext.todayEntries`. */
export interface RemoveFoodInput {
  entry_id: string
}

/** A store mutation the model asked for. Discriminated on `tool` so `input` is typed. */
export type ChatAction =
  | { tool: 'log_food'; input: LogFoodInput }
  | { tool: 'log_weight'; input: LogWeightInput }
  | { tool: 'log_water'; input: LogWaterInput }
  | { tool: 'remove_food'; input: RemoveFoodInput }

export interface ChatResponse {
  /** The assistant's reply. May be empty when the turn was purely tool calls. */
  text: string
  /** Validated actions to apply to the store, in the order the model emitted them. */
  actions: ChatAction[]
  /**
   * How many actions were discarded as unusable (missing name, zero servings, unknown
   * weight unit…). Non-zero means `text` claims something was logged that was not — show
   * the user a warning rather than a clean success.
   */
  discardedActions: number
}

/** Rolling per-day mean intake over a recent window, computed on the client. */
export interface RecentMacros {
  days: number
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Exactly the body `api/recommend.ts` expects — all ground truth, computed on device. */
export interface RecommendRequest {
  profile: UserProfile
  currentWeightKg: number
  goals: MacroGoals
  bodyComp: BodyComposition | null
  tdee: TdeeEstimate
  recentMacros: RecentMacros | null
  alerts: CoachAlert[]
}

// --- Parsing helpers --------------------------------------------------------

const MEAL_TYPES: readonly MealType[] = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Snacks',
  'Pre-Workout',
  'Post-Workout',
]

const FOOD_CATEGORIES: readonly FoodCategory[] = [
  'Fruits',
  'Vegetables',
  'Grains & Cereals',
  'Dairy',
  'Meat & Poultry',
  'Fish & Seafood',
  'Legumes',
  'Nuts & Seeds',
  'Beverages',
  'Snacks',
  'Fast Food',
  'Condiments',
  'Oils & Fats',
  'Sweets & Desserts',
  'Custom',
]

const PHASES: readonly PhaseType[] = ['cut', 'lean_bulk', 'maintain', 'recomp']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** Returns the finite number, or `fallback` for anything else (including NaN). */
const finiteOr = (value: unknown, fallback: number): number =>
  isFiniteNumber(value) ? value : fallback

/** Returns the finite number when it is positive, otherwise null. */
const positiveOr = (value: unknown): number | null =>
  isFiniteNumber(value) && value > 0 ? value : null

/** Returns the value as a non-negative number; a negative macro is nonsense, not data. */
const nonNegative = (value: unknown): number => Math.max(finiteOr(value, 0), 0)

/** Returns the trimmed string when it is non-empty, otherwise null. */
const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const isMealType = (value: unknown): value is MealType =>
  typeof value === 'string' && (MEAL_TYPES as readonly string[]).includes(value)

const isFoodCategory = (value: unknown): value is FoodCategory =>
  typeof value === 'string' && (FOOD_CATEGORIES as readonly string[]).includes(value)

const isPhase = (value: unknown): value is PhaseType =>
  typeof value === 'string' && (PHASES as readonly string[]).includes(value)

/** Returns a short, single-line excerpt of a response body for an error message. */
const snippet = (raw: string): string => {
  const flat = raw.replace(/\s+/g, ' ').trim()
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat
}

// --- Transport --------------------------------------------------------------

/**
 * Returns the message for a non-2xx reply, preferring the handler's own `{ error }` field
 * and falling back to an excerpt of whatever actually came back.
 */
const describeFailure = (path: string, status: number, raw: string): string => {
  let detail = snippet(raw)
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed)) {
      const message = nonEmptyString(parsed.error)
      if (message !== null) detail = message
    }
  } catch {
    // Not JSON — the excerpt is the best detail available.
  }
  return detail.length > 0 ? `${path} failed (HTTP ${status}): ${detail}` : `${path} failed (HTTP ${status}).`
}

/** Performs the request and drains the body. Split out so the timer guards both halves. */
const performPost = async (
  url: string,
  body: unknown,
  signal: AbortSignal,
): Promise<{ status: number; raw: string }> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  // Read as text, not json(): a misconfigured `EXPO_PUBLIC_API_URL` typically returns the
  // Metro bundler's HTML, and `response.json()` would fail with a parse error that says
  // nothing about the cause. The raw text lets the message name the real problem.
  return { status: response.status, raw: await response.text() }
}

/**
 * POSTs `body` as JSON to `path` on the configured API origin and returns the parsed
 * reply, or throws an `Error` whose message is safe to show the user.
 */
const postJson = async (path: string, body: unknown, timeoutMs: number): Promise<unknown> => {
  const url = `${requireApiUrl()}${path}`
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  let result: { status: number; raw: string }
  try {
    result = await performPost(url, body, controller.signal)
  } catch {
    if (timedOut) {
      throw new Error(
        `${path} timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`,
      )
    }
    throw new Error(
      `Could not reach ${url}. Check that EXPO_PUBLIC_API_URL points at an address this ` +
        'device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running.',
    )
  } finally {
    clearTimeout(timer)
  }

  if (result.status < 200 || result.status >= 300) {
    throw new Error(describeFailure(path, result.status, result.raw))
  }

  try {
    return JSON.parse(result.raw) as unknown
  } catch {
    throw new Error(
      `${path} returned a non-JSON response. Is EXPO_PUBLIC_API_URL pointing at the API ` +
        `server rather than the Metro bundler? Response began: ${snippet(result.raw)}`,
    )
  }
}

// --- Response parsers -------------------------------------------------------

/**
 * Returns a usable `AnalyzedFood`, or null when the item cannot be trusted.
 *
 * Only `name` and `servings` are hard requirements. Callers divide the totals by
 * `servings` to derive a per-serving food, so a zero or missing count would write
 * `Infinity` calories into the diary; an unnamed entry is unidentifiable afterwards.
 * Everything else degrades to a sane value rather than throwing the whole item away.
 */
const parseAnalyzedFood = (value: unknown): AnalyzedFood | null => {
  if (!isRecord(value)) return null

  const name = nonEmptyString(value.name)
  if (name === null) return null

  const servings = positiveOr(value.servings)
  if (servings === null) return null

  return {
    name,
    servings,
    servingSize: positiveOr(value.servingSize) ?? 1,
    servingUnit: nonEmptyString(value.servingUnit) ?? 'serving',
    calories: nonNegative(value.calories),
    protein: nonNegative(value.protein),
    carbs: nonNegative(value.carbs),
    fat: nonNegative(value.fat),
    fiber: nonNegative(value.fiber),
    sugar: nonNegative(value.sugar),
    sodium: nonNegative(value.sodium),
    category: isFoodCategory(value.category) ? value.category : 'Custom',
  }
}

/** Returns a validated `ChatAction`, or null when the tool or its arguments are unusable. */
const parseChatAction = (value: unknown): ChatAction | null => {
  if (!isRecord(value)) return null
  const input = value.input
  if (!isRecord(input)) return null

  switch (value.tool) {
    case 'log_food': {
      const food = parseAnalyzedFood(input)
      if (food === null) return null
      // An unrecognised meal only misfiles the entry, so default rather than discard.
      const meal: MealType = isMealType(input.meal) ? input.meal : 'Snacks'
      return { tool: 'log_food', input: { ...food, meal } }
    }
    case 'log_weight': {
      const weight = positiveOr(input.weight)
      if (weight === null) return null
      // Never guess the unit: defaulting is a silent 2.2x error in the weight log, which
      // then poisons every TDEE and trend calculation built on top of it.
      if (input.unit !== 'lbs' && input.unit !== 'kg') return null
      const bodyFat = positiveOr(input.bodyFat)
      return {
        tool: 'log_weight',
        input: bodyFat === null ? { weight, unit: input.unit } : { weight, unit: input.unit, bodyFat },
      }
    }
    case 'log_water': {
      const amount = positiveOr(input.amount_ml)
      if (amount === null) return null
      return { tool: 'log_water', input: { amount_ml: amount } }
    }
    case 'remove_food': {
      const entryId = nonEmptyString(input.entry_id)
      if (entryId === null) return null
      return { tool: 'remove_food', input: { entry_id: entryId } }
    }
    default:
      return null
  }
}

/**
 * Returns the `recommendation` inside an `/api/recommend` reply, or null when any field is
 * missing, of the wrong type, or non-finite.
 *
 * Mirrors the web client's check exactly: a plan that fails this is discarded in favour of
 * the deterministic local one, because rendering `NaN kcal` as a target is worse than
 * showing no AI plan at all.
 */
const parseRecommendation = (payload: unknown): Recommendation | null => {
  if (!isRecord(payload)) return null
  const raw = payload.recommendation
  if (!isRecord(raw)) return null

  const id = nonEmptyString(raw.id)
  const headline = nonEmptyString(raw.headline)
  const rationale = nonEmptyString(raw.rationale)
  const source = raw.source

  if (id === null || headline === null || rationale === null) return null
  if (!isPhase(raw.phase)) return null
  if (!isFiniteNumber(raw.createdAt)) return null
  if (!isFiniteNumber(raw.calories) || raw.calories <= 0) return null
  if (!isFiniteNumber(raw.protein) || raw.protein < 0) return null
  if (!isFiniteNumber(raw.carbs) || raw.carbs < 0) return null
  if (!isFiniteNumber(raw.fat) || raw.fat < 0) return null
  if (!isFiniteNumber(raw.targetRateKgPerWeek)) return null
  if (!isFiniteNumber(raw.durationWeeks) || raw.durationWeeks <= 0) return null
  if (!isFiniteNumber(raw.tdeeUsed) || raw.tdeeUsed < 0) return null
  if (source !== 'ai' && source !== 'local') return null

  return {
    id,
    createdAt: raw.createdAt,
    phase: raw.phase,
    calories: raw.calories,
    protein: raw.protein,
    carbs: raw.carbs,
    fat: raw.fat,
    targetRateKgPerWeek: raw.targetRateKgPerWeek,
    durationWeeks: raw.durationWeeks,
    headline,
    rationale,
    tdeeUsed: raw.tdeeUsed,
    source,
    clamped: raw.clamped === true,
  }
}

// --- Endpoints --------------------------------------------------------------

/**
 * Sends the conversation to `/api/chat` and returns the reply plus the store mutations the
 * model asked for. Throws when the service is unreachable, errors, or returns nothing
 * usable at all.
 *
 * Check `discardedActions` before telling the user everything was logged.
 */
export const postChat = async (
  messages: readonly ChatMessageParam[],
  context: ChatContext,
): Promise<ChatResponse> => {
  const payload = await postJson('/api/chat', { messages, context }, CHAT_TIMEOUT_MS)
  if (!isRecord(payload)) throw new Error('The chat service returned an unexpected response.')

  const text = typeof payload.text === 'string' ? payload.text : ''
  const rawActions: unknown[] = Array.isArray(payload.actions) ? payload.actions : []

  const actions: ChatAction[] = []
  for (const raw of rawActions) {
    const action = parseChatAction(raw)
    if (action !== null) actions.push(action)
  }

  // Nothing said and nothing done is a failed turn, not an answer worth rendering.
  if (text.trim().length === 0 && actions.length === 0) {
    throw new Error('The chat service returned an empty response. Try rephrasing.')
  }

  return { text, actions, discardedActions: rawActions.length - actions.length }
}

/**
 * Sends a meal photo to `/api/analyze-photo` and returns the foods the model identified.
 *
 * `imageBase64` is either a bare base64 payload or a full `data:` URL — the handler accepts
 * both. An empty array is a valid result: it means nothing recognisable was in the frame.
 */
export const postAnalyzePhoto = async (
  imageBase64: string,
  mealType?: MealType,
): Promise<AnalyzedFood[]> => {
  // Fail here rather than paying a round-trip for a guaranteed 400.
  if (imageBase64.trim().length === 0) throw new Error('No image data to analyze.')

  const payload = await postJson(
    '/api/analyze-photo',
    { imageBase64, mealType },
    PHOTO_TIMEOUT_MS,
  )
  if (!isRecord(payload) || !Array.isArray(payload.foods)) {
    throw new Error('The photo service returned an unexpected response.')
  }

  const foods: AnalyzedFood[] = []
  for (const raw of payload.foods as unknown[]) {
    const food = parseAnalyzedFood(raw)
    if (food !== null) foods.push(food)
  }
  return foods
}

/**
 * Sends precomputed coach inputs to `/api/recommend` and returns the next phase plan.
 *
 * Throws when the service is unreachable or the plan fails validation. The caller is
 * expected to fall back to `buildLocalRecommendation` from the shared utils, exactly as
 * the web app does — the user always ends up with numbers.
 */
export const postRecommend = async (payload: RecommendRequest): Promise<Recommendation> => {
  const body = await postJson('/api/recommend', payload, RECOMMEND_TIMEOUT_MS)
  const recommendation = parseRecommendation(body)
  if (recommendation === null) throw new Error('The coach service returned an unusable plan.')
  return recommendation
}
