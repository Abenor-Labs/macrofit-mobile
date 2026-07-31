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
 * A failed call, in two registers.
 *
 * `message` is for the user and never contains a status code, a path, or anything the
 * hosting platform wrote. `detail` is the raw truth for a developer, and is attached to the
 * Error's `cause` rather than rendered.
 */
export interface ApiFailure {
  message: string
  detail: string
  status: number
  /** False when the request never reached a server, which is the only real offline case. */
  reachedServer: boolean
}

/**
 * Returns the user-facing message for a status code.
 *
 * WHY THIS IS NOT THE RESPONSE BODY:
 * `describeFailure` used to paste the body straight into a visible string. For a
 * platform-level failure that body is written by Vercel, not by us, so a coach timeout
 * rendered on the Goals screen as:
 *
 *   /api/recommend failed (HTTP 504): An error occurred with your deployment
 *   FUNCTION_INVOCATION_TIMEOUT bom1::kqj4c-1785470216889-8eadf8fda7a4
 *
 * A deployment region and a trace ID are things the user can neither act on nor understand,
 * and putting them on screen turns a recoverable hiccup into something that reads like the
 * app is broken. The detail is kept — see `ApiFailure.detail` — it just stops being the
 * headline.
 *
 * A handler's OWN `{ error }` message is different and is preferred where present: those
 * are written for a human, and `requireApiKey` in particular returns instructions worth
 * reading.
 */
const messageForStatus = (status: number): string => {
  if (status === 429) return 'Too many requests just now. Wait a minute and try again.'
  if (status === 502 || status === 503 || status === 504) {
    return 'The service is taking too long to answer right now. Try again in a moment.'
  }
  if (status >= 500) return 'The service hit an error. Try again in a moment.'
  if (status === 413) return 'That was too large to send. Try a smaller image.'
  if (status >= 400) return 'That request was rejected. Try again.'
  return 'Something went wrong. Try again.'
}

/**
 * Splits a non-2xx reply into what the user reads and what a developer needs.
 *
 * The handler's own `{ error }` string wins when there is one: `api/*.ts` writes those for
 * humans. Anything else — an HTML error page, a platform timeout, a proxy's plain text —
 * gets the mapped message above, because it was not written for this user.
 */
const describeFailure = (path: string, status: number, raw: string): ApiFailure => {
  const detail = `${path} failed (HTTP ${status}): ${snippet(raw)}`

  let handlerMessage: string | null = null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed)) handlerMessage = nonEmptyString(parsed.error)
  } catch {
    // Not JSON. Whatever this is, it did not come from one of our handlers.
  }

  return {
    message: handlerMessage ?? messageForStatus(status),
    detail,
    status,
    reachedServer: true,
  }
}

/**
 * An Error carrying both registers.
 *
 * `message` is what any existing `catch (e) { show(e.message) }` renders, so every call site
 * gets the human copy without being changed. `cause` carries the `ApiFailure` for anything
 * that wants to branch on the real cause — which the Goals screen does, to tell a server
 * timeout apart from being genuinely offline.
 */
export class ApiError extends Error {
  readonly failure: ApiFailure

  constructor(failure: ApiFailure) {
    super(failure.message, { cause: failure })
    this.name = 'ApiError'
    this.failure = failure
    if (__DEV__) console.warn(`[api] ${failure.detail}`)
  }
}

/** True when the throw came from a request that never reached a server. */
export const isOffline = (error: unknown): boolean =>
  error instanceof ApiError && !error.failure.reachedServer

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
    // Neither of these reached a server, so both are genuinely offline-ish and callers are
    // right to say so. Everything past this point did reach one, and must not.
    if (timedOut) {
      throw new ApiError({
        message: `This took longer than ${Math.round(timeoutMs / 1000)} seconds. Check your connection and try again.`,
        detail: `${path} aborted after ${timeoutMs}ms`,
        status: 0,
        reachedServer: false,
      })
    }
    throw new ApiError({
      message: 'Could not reach the server. Check your connection and try again.',
      // The setup advice is real and worth keeping, but it is advice for whoever configured
      // the build, not for the person holding the phone.
      detail:
        `Could not reach ${url}. Check that EXPO_PUBLIC_API_URL points at an address this ` +
        'device can reach (a LAN IP or a deployed URL, never localhost) and that the server is running.',
      status: 0,
      reachedServer: false,
    })
  } finally {
    clearTimeout(timer)
  }

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(describeFailure(path, result.status, result.raw))
  }

  try {
    return JSON.parse(result.raw) as unknown
  } catch {
    throw new ApiError({
      message: 'The server sent back something unreadable. Try again in a moment.',
      detail:
        `${path} returned a non-JSON response. Is EXPO_PUBLIC_API_URL pointing at the API ` +
        `server rather than the Metro bundler? Response began: ${snippet(result.raw)}`,
      status: result.status,
      reachedServer: true,
    })
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
