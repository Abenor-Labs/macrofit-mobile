/*
  The app's entry: Expo Router's own, plus the home-screen widgets' background task.

  The task has to be registered when the bundle loads, not when a screen mounts — Android
  starts it in a runtime where no screen ever mounts. `require` rather than `import` because
  the widget library throws on load in a build without its native half (see
  src/widgets/native.ts), and an import cannot be made conditional.
*/
import 'expo-router/entry'
import { widgetsAvailable } from './src/widgets/native'

if (widgetsAvailable) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./src/widgets/register')
}
