const { getDefaultConfig } = require('expo/metro-config')

/*
  Deliberately a plain, single-root Metro config.

  Shared business logic is vendored into src/core by scripts/sync-core.mjs rather than
  bundled from ../src through a watchFolder: Metro does not resolve reliably outside the
  project root, and EAS Build uploads only this directory, so an out-of-root source would
  vanish in a cloud build.
*/
const config = getDefaultConfig(__dirname)

/*
  Production React strips <Profiler> timing. React Native ships a profiling build of its
  renderer that keeps it at production speed, so a measuring run (EXPO_PUBLIC_PERF=1, see
  scripts/perf-run.mjs) resolves the shim's production renderer to that one instead.
*/
if (process.env.EXPO_PUBLIC_PERF === '1') {
  const upstream = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const name = moduleName.endsWith('/implementations/ReactFabric-prod')
      ? moduleName.replace(/ReactFabric-prod$/, 'ReactFabric-profiling')
      : moduleName
    return (upstream ?? context.resolveRequest)(context, name, platform)
  }
}

module.exports = config
