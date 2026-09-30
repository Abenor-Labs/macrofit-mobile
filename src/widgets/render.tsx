import React from 'react'
import type { WidgetInfo, WidgetRepresentation } from 'react-native-android-widget'
import type { AppState } from '@core/store/appState'
import { getTodayString } from '@core/utils/calculations'
import { addDays } from '@core/utils/trainingProgram'
import { todayModel, trainingModel } from './model'
import { todayPalettes, trainingPalette } from './palette'
import { TodayWidget } from './TodayWidget'
import { TrainingWidget } from './TrainingWidget'

/**
 * The drawing for one placed widget, from the store as it stands.
 *
 * `today` is read here, at draw time, never cached: the hourly redraw after midnight is what
 * moves the widget onto the new day when nobody has opened the app.
 */
export const renderWidget = (state: AppState, info: Pick<WidgetInfo, 'widgetName' | 'width' | 'height'>): WidgetRepresentation => {
  // The launcher's portrait size — see the note on getPortraitSize in
  // patches/react-native-android-widget+0.22.1.patch for why that needed patching.
  const size = { width: info.width, height: info.height }
  const today = getTodayString()

  if (info.widgetName === 'Training') {
    return <TrainingWidget model={trainingModel(state, today, addDays(today, 1))} size={size} palette={trainingPalette} />
  }

  const model = todayModel(state, today)
  return {
    light: <TodayWidget model={model} size={size} palette={todayPalettes.light} />,
    dark: <TodayWidget model={model} size={size} palette={todayPalettes.dark} />,
  }
}
