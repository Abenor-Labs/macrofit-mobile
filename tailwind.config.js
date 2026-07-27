/** @type {import('tailwindcss').Config} */

/*
  Mirrors ../docs/DESIGN-SYSTEM.md so the mobile app and the web app speak the same
  token language. The macro palette values are the ones validated with the dataviz
  palette validator (lightness band, chroma floor, CVD separation, normal-vision floor
  and contrast, all-pairs, in both modes) — do not substitute them.

  React Native has no CSS custom properties, so unlike the web build the light and dark
  macro steps are separate token names and the component picks one via the theme hook.
*/

const jade = {
  50: '#EDFAF5',
  100: '#D3F3E6',
  200: '#A8E7CE',
  300: '#71D5AF',
  400: '#38BC8D',
  500: '#12A175',
  600: '#0C8261',
  700: '#0B674E',
  800: '#0B5240',
  900: '#0A4335',
}

module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './src/**/*.{js,ts,jsx,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: jade,
        jade,
        macro: {
          // light-mode steps
          protein: '#168BE1',
          carbs: '#C97004',
          fat: '#9B204A',
          fiber: '#924BAC',
          // dark-mode steps (independently validated, not a tint of the above)
          'protein-dark': '#2F9AF2',
          'carbs-dark': '#DD7610',
          'fat-dark': '#DA5F8B',
          'fiber-dark': '#9851B2',
        },
        status: {
          warning: '#B45309',
          'warning-dark': '#F59E0B',
          critical: '#B91C1C',
          'critical-dark': '#F87171',
        },
      },
      fontFamily: {
        display: ['Fraunces_600SemiBold'],
        'display-bold': ['Fraunces_700Bold'],
        sans: ['Figtree_400Regular'],
        medium: ['Figtree_500Medium'],
        semibold: ['Figtree_600SemiBold'],
      },
    },
  },
  plugins: [],
}
