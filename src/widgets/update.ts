import { requestPinWidget, requestWidgetUpdate } from 'react-native-android-widget'
import { useStore } from '@/store/useStore'
import { WIDGET_NAMES, type WidgetName } from './native'
import { renderWidget } from './render'

/*
  Loads the widget library, so it may only be reached through `require` behind
  `widgetsAvailable` — see native.ts. App code goes through src/widgets/index.ts.
*/

/** Redraw every placed copy of the named widgets from the store as it is now. */
export const refreshWidgets = async (names: readonly WidgetName[] = WIDGET_NAMES): Promise<void> => {
  for (const widgetName of names) {
    await requestWidgetUpdate({
      widgetName,
      renderWidget: info => renderWidget(useStore.getState(), info),
    })
  }
}

/** The launcher's own "add to home screen" prompt. False where the launcher has none. */
export const pinWidget = (widgetName: WidgetName): Promise<boolean> => requestPinWidget({ widgetName })
