module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-worklets/plugin replaces the old reanimated plugin in Reanimated 4.
    // It must stay last.
    plugins: ['react-native-worklets/plugin'],
  }
}
