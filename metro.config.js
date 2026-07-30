const { getDefaultConfig } = require('expo/metro-config')

/*
  Deliberately a plain, single-root Metro config.

  Shared business logic is vendored into src/core by scripts/sync-core.mjs rather than
  bundled from ../src through a watchFolder: Metro does not resolve reliably outside the
  project root, and EAS Build uploads only this directory, so an out-of-root source would
  vanish in a cloud build.
*/
module.exports = getDefaultConfig(__dirname)
