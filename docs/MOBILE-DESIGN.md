# MacroFit Mobile — Design System

**Authoritative.** Same brand as the web app (`../../docs/DESIGN-SYSTEM.md`), rebuilt for
native. Never invent a color, radius, or font. If something is missing, use the nearest
token rather than a one-off value.

Direction: **warm editorial athletic, rendered in glass.** Warm stone canvas, jade brand,
Fraunces numerals over Figtree UI — with real native blur (`expo-blur`) providing depth
that a webview cannot match. Glass is a *material*, not a decoration: it appears where
something floats above content, never on flat body copy.

---

## 1. Where glass is allowed

Native blur is expensive and illegible when overused. Use `GlassSurface` **only** for:

- the tab bar and any floating action button
- headers that content scrolls beneath
- modals, sheets, and the lift/food pickers
- the hero card on Dashboard and the Coach plan card
- badges that sit on top of imagery

**Never** use glass for: long lists, dense stat tables, body paragraphs, or nested inside
another glass surface (double blur turns to mud). A plain `Surface` (solid stone card) is
the default; reach for glass deliberately.

Every glass surface needs a **hairline border** and a subtle **top highlight** — without
an edge, blur reads as a rendering bug rather than a material.

## 2. Color

Ported from the web tokens. The macro palette was validated with the dataviz palette
validator (lightness band, chroma floor, CVD separation, normal-vision floor, contrast —
all pairs, both modes). **Do not substitute these values.**

React Native has no CSS custom properties, so light and dark macro steps are separate
tokens. Always read them through `useTheme()`; never hardcode a hex in a component.

| Role | Light | Dark |
|---|---|---|
| Canvas | `#FAFAF9` stone-50 | `#0C0A09` stone-950 |
| Surface | `#FFFFFF` | `#1C1917` stone-900 |
| Border | `#E7E5E4` stone-200 | `#292524` stone-800 |
| Text primary | `#1C1917` | `#F5F5F4` |
| Text secondary | `#57534E` | `#A8A29E` |
| Text muted | `#78716C` | `#78716C` |
| Protein | `#168BE1` | `#2F9AF2` |
| Carbs | `#C97004` | `#DD7610` |
| Fat | `#9B204A` | `#DA5F8B` |
| Fiber | `#924BAC` | `#9851B2` |

Brand jade: `600 #0C8261` is the floor for white text (4.79:1) — **`jade-500` fails AA at
3.29:1, never put white on it.** Brand text on light uses `jade-700`, on dark `jade-400`.

Status is reserved and never reused as a data series:
good `jade-600`/`jade-400`, warning `#B45309`/`#F59E0B`, critical `#B91C1C`/`#F87171`.
Always ship status with an icon **and** words — never color alone.

Sugar and sodium are **not** in the categorical palette. Render them neutral stone with a
direct label. Do not invent a fifth hue.

## 3. Typography

Loaded via `@expo-google-fonts/*` subpath imports and `expo-font`.

| Role | Family | Use |
|---|---|---|
| Display | `Fraunces_600SemiBold` / `Fraunces_700Bold` | Every number the user reads as data, plus screen titles |
| UI | `Figtree_400Regular` / `_500Medium` / `_600SemiBold` | Everything else |

**Every data number wears Fraunces.** Calories, macro grams, weights, reps, streaks. This
is the app's signature. Use `<StatValue>` rather than styling text ad hoc. React Native
has no `tabular-nums`, so `StatValue` applies `fontVariant: ['tabular-nums']`, which the
platform honours where the font supports it.

Never use the system font stack for data.

## 4. Shape, depth, motion

- Radii: cards `24`, controls `16`, pills `999`.
- Depth: hairline border + soft shadow on light; on dark, borders and surface lift do the
  work (shadows are invisible). Glass adds its own separation.
- Motion: Reanimated. 150ms press feedback, 250ms enter, spring for sheets. Honour
  `useReducedMotion()` — skip transforms, keep opacity.
- Haptics on meaningful commits only (set completed, plan accepted, food logged) — never
  on scroll or plain navigation.
- Touch targets ≥44. Respect safe areas via `react-native-safe-area-context`; the tab bar
  must clear the home indicator.

## 5. Components (`src/components/`)

Build against these; do not re-implement:

`GlassSurface` · `Surface` · `StatValue` · `Label` · `Button` · `IconButton` · `Field` ·
`Pill` · `ProgressTrack` · `MacroRing` · `Sheet` · `EmptyState` · `SectionTitle`

If a pattern appears three times, it belongs here.

## 6. Non-negotiables

- Accessibility: every touchable has `accessibilityLabel` and `accessibilityRole`.
- Never render a fabricated number as a placeholder. Show a real empty state that says
  what to do.
- Weights persist in **kg** always; convert only at the input/display boundary.
- Business logic lives in `../src/utils` (shared with web) — never reimplement a formula
  in a component.
