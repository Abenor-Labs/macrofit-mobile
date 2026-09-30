import { widgetsAvailable, type WidgetName } from './native'

/*
  The widgets as the app sees them. Everything here is a no-op on a build without the
  widget's native half (see native.ts), so callers need no checks of their own.
*/

export { widgetsAvailable, type WidgetName } from './native'

type UpdateModule = typeof import('./update')

const load = (): UpdateModule | null =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  widgetsAvailable ? (require('./update') as UpdateModule) : null

export const refreshWidgets = async (names?: readonly WidgetName[]): Promise<void> => {
  try {
    await load()?.refreshWidgets(names)
  } catch {
    // A widget that cannot be redrawn keeps its last drawing; nothing the user did failed.
  }
}

export const pinWidget = async (name: WidgetName): Promise<boolean> => {
  try {
    return (await load()?.pinWidget(name)) ?? false
  } catch {
    return false
  }
}
