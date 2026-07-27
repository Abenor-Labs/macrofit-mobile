const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

/*
  Deliberately a plain, single-root Metro config.

  Shared business logic is vendored into src/core by scripts/sync-core.mjs rather than
  bundled from ../src through a watchFolder: Metro does not resolve reliably outside the
  project root, and EAS Build uploads only this directory, so an out-of-root source would
  vanish in a cloud build.
*/
const config = getDefaultConfig(__dirname)

module.exports = withNativeWind(config, { input: './global.css' })
