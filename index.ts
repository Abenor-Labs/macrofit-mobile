/*
  The app's entry: Expo Router's own, plus the background tasks — the home-screen widgets'
  and the periodic one that re-arms reminders.

  Both have to be registered when the bundle loads, not when a screen mounts — Android
  starts them in a runtime where no screen ever mounts. The widgets' with `require` rather
  than `import` because the widget library throws on load in a build without its native half
  (see src/widgets/native.ts), and an import cannot be made conditional.
*/
import 'expo-router/entry'
import './src/lib/updateTask'
import { widgetsAvailable } from './src/widgets/native'

if (widgetsAvailable) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./src/widgets/register')
}
