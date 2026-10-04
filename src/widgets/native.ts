import { NativeModules, Platform, TurboModuleRegistry } from 'react-native'

/**
 * Whether this build carries the home-screen widget's native half.
 *
 * react-native-android-widget looks its native module up with `getEnforcing` the moment it is
 * imported, which throws on any build made before the widgets were added — an installed APK
 * running a newer JS bundle over Metro, or the in-app updater landing JS ahead of a rebuild.
 * So nothing may import the library directly: the widget code is only ever `require`d behind
 * this check, and on a build without it every widget feature quietly does not exist.
 */
export const widgetsAvailable: boolean = (() => {
  if (Platform.OS !== 'android') return false
  try {
    return TurboModuleRegistry.get('AndroidWidget') != null || NativeModules.AndroidWidget != null
  } catch {
    return false
  }
})()

/** The names the widgets are registered under in app.json. */
export const WIDGET_NAMES = ['Today', 'Training', 'MacroFit'] as const
export type WidgetName = (typeof WIDGET_NAMES)[number]
