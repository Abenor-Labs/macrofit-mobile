/// <reference types="nativewind/types" />

// Metro/NativeWind resolve `global.css` as a side-effect import, but TypeScript has no
// notion of it and errors on the import in app/_layout.tsx without this declaration.
declare module '*.css'
