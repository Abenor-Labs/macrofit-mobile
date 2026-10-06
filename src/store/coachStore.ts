import AsyncStorage from '@react-native-async-storage/async-storage'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AnalyzedFood } from '@/lib/api'

/**
 * What the coach keeps between visits: the conversation, the facts it was asked to remember,
 * and when the last weekly check-in ran.
 *
 * The chat used to hold its transcript in component state, so closing the screen erased it
 * and every visit started from "Hi! I'm your nutrition assistant". A coach that forgets you
 * were vegetarian the moment you close it is not a coach.
 *
 * Device-local and outside the synced store on purpose: a transcript is large, changes on
 * every message, and has no place in the row the diary syncs through. It IS cleared on an
 * account switch (see resetStore), because what one person told the coach must never greet
 * the next person to sign in on the same phone.
 */

/** A store write a reply made, echoed back so the user can verify or undo it. */
export interface LoggedAction {
  type: 'food' | 'weight' | 'water'
  label: string
  value: number
  unit: string
  /** Diary entry ids this action created, so Undo removes exactly these. */
  entryIds?: string[]
  /** Kept for transcripts saved before `entryIds` existed. */
  foodId?: string
  macros?: { protein: number; carbs: number; fat: number }
}

/** A meal the coach suggested, shown as a card with a "Log this" button. */
export interface MealOffer {
  meal: string
  items: (AnalyzedFood & { foodId: string })[]
  /** Set once logged, so the card turns into a receipt instead of offering twice. */
  loggedAt?: number
}

/** New daily targets the coach proposed, shown with an "Apply" button. */
export interface TargetProposal {
  calories: number
  protein: number
  carbs: number
  fat: number
  reason: string
  /** Set once applied. */
  appliedAt?: number
  /** The targets before applying, so the change can be reversed. */
  previous?: { calories: number; protein: number; carbs: number; fat: number }
}

export interface ChatEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** When the message was written, for the day dividers. */
  at?: number
  actions?: LoggedAction[]
  /** Count of tool calls the server or client refused. Non-zero means `text` may overclaim. */
  discarded?: number
  /** True when this turn failed outright; rendered with the critical status treatment. */
  failed?: boolean
  /** The user text that triggered this failed turn, so a retry can re-send it. */
  retryText?: string
  /**
   * The user reported food and nothing reached the diary. Shown as "Not saved" with a
   * one-tap retry that re-sends `retryText`, so a missed log is seen in the chat, not
   * discovered later in the diary.
   */
  missed?: boolean
  /** Local URI of an attached meal photo, shown in place of a text bubble. */
  photo?: string
  /** Vision results awaiting confirmation. */
  review?: AnalyzedFood[]
  /** Excludes this turn from the history sent to the model (photo turns carry no text). */
  fromPhoto?: boolean
  /** Written on the phone, not by the model: the daily opener. Sent as history all the same. */
  local?: boolean
  offer?: MealOffer
  proposal?: TargetProposal
  /** "Remembered: …" / "Forgot: …" notes from this reply. */
  memoryNotes?: string[]
}

/** Enough to cover weeks of daily use without the store growing without bound. */
const MAX_MESSAGES = 150
const MAX_MEMORY = 30

interface CoachStore {
  messages: ChatEntry[]
  memory: string[]
  lastCheckInAt: number | null
  setMessages: (update: (prev: ChatEntry[]) => ChatEntry[]) => void
  remember: (fact: string) => void
  forget: (fact: string) => void
  markCheckIn: (at: number) => void
  clearConversation: () => void
  reset: () => void
}

const sameFact = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export const useCoachStore = create<CoachStore>()(
  persist(
    set => ({
      messages: [],
      memory: [],
      lastCheckInAt: null,
      setMessages: update => set(state => ({ messages: update(state.messages).slice(-MAX_MESSAGES) })),
      remember: fact =>
        set(state =>
          state.memory.some(m => sameFact(m, fact))
            ? state
            : { memory: [...state.memory, fact.trim()].slice(-MAX_MEMORY) },
        ),
      forget: fact =>
        set(state => {
          // The model quotes a fact loosely ("no beef" for "No beef; eats eggs"), so an exact
          // match is tried first and a containment match second.
          const exact = state.memory.filter(m => !sameFact(m, fact))
          if (exact.length !== state.memory.length) return { memory: exact }
          const needle = fact.trim().toLowerCase()
          return { memory: state.memory.filter(m => !m.toLowerCase().includes(needle) && !needle.includes(m.toLowerCase())) }
        }),
      markCheckIn: at => set({ lastCheckInAt: at }),
      clearConversation: () => set({ messages: [] }),
      reset: () => set({ messages: [], memory: [], lastCheckInAt: null }),
    }),
    {
      name: 'macrofit-coach',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ messages, memory, lastCheckInAt }) => ({
        // A turn still waiting on the user (an unconfirmed photo review) cannot be resumed
        // after a restart, and failed turns are noise once the moment has passed.
        messages: messages.filter(m => !m.failed).map(m => (m.review ? { ...m, review: undefined } : m)),
        memory,
        lastCheckInAt,
      }),
    },
  ),
)
