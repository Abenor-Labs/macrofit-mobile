import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Half } from './model'

/*
  Which half of the MacroFit widget someone asked to see.

  Tapping Train on the food half shows training, and Food on the training half shows food. The
  choice is kept for a while and then dropped, so the card goes back to the half the moment
  calls for at a later redraw instead of staying on whichever side was last tapped. It is also
  dropped as soon as the moment itself moves on — a workout started or finished, 3 pm arriving —
  because a tap made for one moment says nothing about the next: Train tapped to start a session
  must not keep the card on training once it is done and the food half is asking for protein.

  Kept in AsyncStorage because the tap is handled by the widget's background task, which may
  run in a fresh runtime that shares nothing with the last one.
*/

const KEY = 'macrofit.widget.half'
/** Long enough to read it and act; short enough that it is gone by the next glance. */
export const HALF_TTL_MS = 20 * 60 * 1000

export interface HalfChoice {
  half: Half
  at: number
  /** The half the moment called for when the choice was made. */
  home: Half
}

let cached: HalfChoice | null = null

export const chooseHalf = async (half: Half, home: Half): Promise<void> => {
  cached = { half, at: Date.now(), home }
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cached))
  } catch {
    // Not kept: this redraw still shows it, a later one falls back to the moment's half.
  }
}

/** Reads the choice into the cache the (synchronous) drawing reads from. */
export const loadHalfChoice = async (): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<HalfChoice>) : null
    const isHalf = (value: unknown): value is Half => value === 'food' || value === 'train'
    cached =
      parsed && isHalf(parsed.half) && isHalf(parsed.home) && typeof parsed.at === 'number'
        ? { half: parsed.half, at: parsed.at, home: parsed.home }
        : null
  } catch {
    // Keep whatever this runtime already knew.
  }
}

/** The half to draw: a fresh choice made in this same moment, else the moment's own. */
export const halfToShow = (home: Half, now: number = Date.now()): Half =>
  cached && cached.home === home && now - cached.at < HALF_TTL_MS && now >= cached.at ? cached.half : home

/** The widget's own click actions, handled by its background task (register.ts). */
export const SHOW_TRAIN = 'SHOW_TRAIN'
export const SHOW_FOOD = 'SHOW_FOOD'
