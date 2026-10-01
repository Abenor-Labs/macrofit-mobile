import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerWidgetTaskHandler, type WidgetTaskHandler } from 'react-native-android-widget'
import { getTodayString } from '@core/utils/calculations'
import { syncRemindersInBackground } from '@/lib/reminderSync'
import { licenceLocalEdit } from '@/lib/syncKeys'
import { STORAGE_KEY, useStore, whenStoreHydrated } from '@/store/useStore'
import { WIDGET_WATER_ML } from './model'
import { renderWidget } from './render'
import { refreshWidgets } from './update'

/*
  The widgets' background task: every time the launcher adds, resizes or redraws a widget, or
  someone taps its water button, Android runs this in the app's JS — in the app's own runtime
  if it is alive, or in a fresh one with nothing mounted if it is not.

  In the fresh case nothing has loaded the user's data yet, so the task waits for it, and it
  draws the "open the app" state rather than a day of zeros if the read fails.
*/

/**
 * Water from the home screen, without opening the app.
 *
 * Refuses on a store that did not load or has never been set up: writing to defaults would
 * persist them over the real data still on disk.
 */
const addWaterFromWidget = async (): Promise<void> => {
  const state = useStore.getState()
  if (state.onboardedAt === null) return
  state.addWater(getTodayString(), WIDGET_WATER_ML)
  // The launch after this reads the account from the server and would replace the edit with
  // the server's copy unless the device is marked as holding work to publish.
  await licenceLocalEdit()
  // zustand persists without waiting, and a fresh runtime can be torn down as soon as this
  // task resolves. AsyncStorage runs its operations in order, so once a read of the store's
  // key has come back, the write the edit queued before it has landed.
  await AsyncStorage.getItem(STORAGE_KEY)
}

/** Per runtime: the two widgets' hourly redraws usually land in the same one. */
const REMINDER_SYNC_GAP_MS = 10 * 60 * 1000
let lastReminderSync = 0

const handler: WidgetTaskHandler = async ({ widgetInfo, widgetAction, clickAction, renderWidget: draw }) => {
  if (widgetAction === 'WIDGET_DELETED') return

  const readable = await whenStoreHydrated()
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'ADD_WATER' && readable) {
    await addWaterFromWidget()
    // Every copy of Today shows the new total, not only the one that was tapped.
    await refreshWidgets(['Today'])
    return
  }

  draw(renderWidget(useStore.getState(), widgetInfo))

  // The hourly redraw is the one thing that reliably wakes this app while nobody uses it, so
  // it also re-arms the reminders: a schedule the system wiped overnight comes back within
  // the hour rather than at the next launch. Both widgets redraw on the hour; once is enough.
  if (widgetAction === 'WIDGET_UPDATE' && readable && Date.now() - lastReminderSync > REMINDER_SYNC_GAP_MS) {
    lastReminderSync = Date.now()
    await syncRemindersInBackground()
  }
}

registerWidgetTaskHandler(handler)
