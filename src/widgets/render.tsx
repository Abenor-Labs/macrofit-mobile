import React from 'react'
import type {
  SingleWidgetRepresentation,
  WidgetInfo,
  WidgetRepresentation,
} from 'react-native-android-widget'
import type { AppState } from '@core/store/appState'
import { getTodayString } from '@core/utils/calculations'
import { addDays } from '@core/utils/trainingProgram'
import { todayModel, trainingModel } from './model'
import { todayPalettes, trainingPalette } from './palette'
import { TodayWidget, type WidgetSize } from './TodayWidget'
import { TrainingWidget } from './TrainingWidget'

/**
 * The drawing for one placed widget, from the store as it stands.
 *
 * One drawing per size the launcher can show the widget at, and the system shows the one that
 * fits the space the widget really has. The launcher's sizes carry no label saying which is in
 * use, and guessing was wrong on OnePlus: a 183dp drawing in a 139dp slot lost its buttons.
 * `width` and `height` (a single guessed size) are only used before Android 12.
 *
 * `today` is read here, at draw time, never cached: the hourly redraw after midnight is what
 * moves the widget onto the new day when nobody has opened the app.
 */
export const renderWidget = (
  state: AppState,
  info: Pick<WidgetInfo, 'widgetName' | 'width' | 'height' | 'sizes'>
): WidgetRepresentation => {
  const today = getTodayString()

  const draw = (size: WidgetSize): SingleWidgetRepresentation => {
    if (info.widgetName === 'Training') {
      return <TrainingWidget model={trainingModel(state, today, addDays(today, 1))} size={size} palette={trainingPalette} />
    }
    const model = todayModel(state, today)
    return {
      light: <TodayWidget model={model} size={size} palette={todayPalettes.light} />,
      dark: <TodayWidget model={model} size={size} palette={todayPalettes.dark} />,
    }
  }

  const sizes = info.sizes ?? []
  if (sizes.length === 0) return draw({ width: info.width, height: info.height })
  return {
    // Whole dp, rounded down: a drawing a fraction wider than its slot loses its last pixel.
    sizes: withHiddenInsets(sizes).map(({ width, height }) => ({
      width,
      height,
      widget: draw({ width: Math.floor(width), height: Math.floor(height) }),
    })),
  }
}

/*
  OnePlus's launcher sometimes frames a widget in padding it does not report: 11 / 51 / 11 / 127px
  (left, top, right, bottom) where it reports sizes for 24px all round. Read from the launcher's
  own view tree on a OnePlus 10T (Android 14): a widget added or resized from the launcher gets
  it, one rebuilt after an app update does not. That slot is 8.7dp wider and 43.3dp shorter than
  reported, and a drawing made for the reported size lost its whole button row below the fold.

  So each reported size also gets a drawing for that slot, and one only that much shorter in case
  the side padding differs. The system measures the space the widget really has and shows the
  drawing that fits it best; a launcher that reports honestly always gets its exact size.
*/
const HIDDEN_WIDTH_DP = 26 / 3
const HIDDEN_HEIGHT_DP = 130 / 3
/** Shorter than this, nothing but the number fits; not worth a drawing. */
const MIN_HEIGHT_DP = 40

const withHiddenInsets = (sizes: WidgetSize[]): WidgetSize[] => {
  const all: WidgetSize[] = []
  const add = (size: WidgetSize) => {
    if (size.height < MIN_HEIGHT_DP) return
    if (all.some(s => Math.abs(s.width - size.width) < 0.5 && Math.abs(s.height - size.height) < 0.5)) return
    all.push(size)
  }
  for (const { width, height } of sizes) {
    add({ width, height })
    add({ width: width + HIDDEN_WIDTH_DP, height: height - HIDDEN_HEIGHT_DP })
    add({ width, height: height - HIDDEN_HEIGHT_DP })
  }
  return all
}
