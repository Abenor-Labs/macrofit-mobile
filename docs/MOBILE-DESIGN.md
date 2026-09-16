# MacroFit Mobile — Design System

**Authoritative.** Same brand as the web app (`../../docs/DESIGN-SYSTEM.md`), rebuilt for
native. Never invent a color, radius, or font. If something is missing, use the nearest
token rather than a one-off value.

Direction: **warm editorial athletic.** Warm stone canvas, jade brand, Fraunces numerals
over Figtree UI. Depth comes from solid surfaces at different lightnesses, and blur is
reserved for the few layers that genuinely float.

---

## 0. What this document replaced, and why

On 2026-09-06 this file was rewritten to say *"glass is the material, not the exception"* —
every surface in the app, including diary rows and stat tables, was routed through a
refracting pane. On device that produced four faults at once: washed out with no hierarchy,
smeary rather than glassy on Android, slow on dense screens, and incoherent overall. The
implementation is preserved in commit `d9992dc` as a revert point.

The replacement is modelled on Telegram's Android client (`DrKLO/Telegram`) and its web
client (`Ajaxy/telegram-tt`), read directly. The single most useful finding is that
**Telegram almost never puts glass on content.** It ships one of the most sophisticated
glass implementations on the platform and applies it to the tab bar, sheets, menus and
badges — nothing else. Values below carrying a *(TG)* marker were measured from that source
rather than chosen.

---

## 1. Three materials, and only one of them is glass

Every surface in the app is exactly one of these. If you cannot name which, you are about to
build the thing that failed.

| Tier | What it is | Material | Where |
|---|---|---|---|
| **Ground** | The page itself | Solid `canvas` | Every screen root |
| **Island** | Anything holding content | Solid `surface` + radius + edge | Cards, rows, stat tables, list items, inputs, buttons |
| **Glass** | Layers content passes *under* | Blur + heavy tint | Tab bar, screen header, sheets, modals, menus, snackbar, badges over imagery |

**Islands never blur.** Not at low intensity, not "just the hero card". A card sitting in
scroll content has nothing meaningful behind it to refract, so blur there buys a legibility
cost and a frame cost in exchange for nothing.

**Glass never holds body copy.** It holds chrome: tab labels, a title, sheet controls. If a
paragraph or a table of figures needs to sit on it, it should have been an island.

*(TG)* `MainTabsActivity` attaches the glass drawable to `tabsView`. `ShareAlert` and
`StarGiftPreviewSheet` attach it to sheets. Chat rows and settings rows draw
`key_windowBackgroundWhite`, flat. On web, `backdrop-filter` appears only on menus, the
reaction picker, toasts, the folders sidebar, modals, and badges over media.

### The section group — how lists are built

A list of related rows is **one island containing many rows**, separated by inset hairlines.
It is *not* one card per row. This is the single biggest visual fix available: a screen of
individually-carded rows reads as a stack of identical slabs no matter what material they
are made of.

Groups are separated from each other by a band of `canvas`, not by a gap between cards.

*(TG)* `_mixins.scss @mixin side-panel-section` — solid background, a `0.625rem` solid
divider of the secondary background between sections, and an inset hairline at the bottom
edge of each.

---

## 2. The glass recipe

The failure mode of the previous system was **low tint, heavy effect**. Correct is the
inverse: **heavy tint, modest blur.** The tint carries legibility; the blur is texture.

| Token | Light | Dark | Workout |
|---|---|---|---|
| `glass.tint` | `rgba(255,255,255,0.72)` | `rgba(21,26,24,0.86)` | `rgba(19,22,25,0.86)` |
| `glass.intensity` (expo-blur) | `30` | `30` | `30` |
| `glass.border` | `rgba(28,25,23,0.10)` | `rgba(238,241,239,0.12)` | `rgba(190,242,100,0.14)` |

*(TG)* `--color-background-compact-menu` is `#FFFFFFBB` light (72.5%) and `#212121DD` dark
(86.7%), over `backdrop-filter: blur(10px)`. The reaction picker goes further still, to
`#FFFFFFEB` (92%). Telegram's glass is nearly opaque; it reads as glass because of the *edge
and the motion behind it*, not because you can see through it.

The old `chromeOverlay: rgba(255,255,255,0.30)` is the direct cause of "washed out". At 30%
the tint cannot hold a tab label's contrast, and the blur underneath is doing work nobody
can see.

**Over imagery only** — meal photos, progress photos — add a `rgba(0,0,0,0.10)` scrim above
the blur before drawing content. *(TG)* `BlurBehindDrawable` unconditionally draws
`canvas.drawColor(0x1a000000)` over its blurred bitmap, because a bright wallpaper otherwise
eats white text.

---

## 3. Refraction: what we do, and what we stopped doing

**Stopped:** magnifying the backdrop about the pane's centre and blurring the copy. That
displaces the *entire* pane uniformly, which the eye reads as a smudge rather than a lens,
and it costs a redrawn backdrop per pane.

**What real refraction does instead:** bend light only in a narrow band at the edge, and
leave the centre of the pane undistorted.

*(TG)* `res/raw/liquid_glass_shader.agsl` computes a signed distance field for the rounded
rect, then:

```glsl
half n_cos = max(thickness + sd, 0.0) / thickness;
```

Displacement scales to zero as soon as the sample is deeper than `thickness` from the edge
(`sd < -thickness` clamps `h` to `thickness`, and the normal points straight out). The middle
of a Telegram glass pane is a *sharp* image of what is behind it. Only the rim bends. That
contrast between a crisp centre and a bent edge is the entire optical signal.

We cannot reproduce this in React Native without an AGSL/Skia shader pipeline, and a bad
approximation is worse than none. So:

- **iOS 26+** — `expo-glass-effect`'s `GlassView`. The OS does it properly.
- **Everywhere else** — blur + tint from §2. No displacement. An honest frosted pane.
- **Reduce Transparency, Lite Mode, or low-end device** — solid `surfaceRaised`, no blur.

*(TG)* Telegram makes the same three-way split: `LiteMode.isEnabled(LiteMode.FLAG_LIQUID_GLASS)`
gates the shader, `SharedConfig.chatBlurEnabled()` gates the blur, and everything else gets a
flat colour source (`BlurredBackgroundSourceColor`).

---

## 4. Colour

Read every value through `useTheme()`. Never hardcode a hex in a component.

The macro palette was produced by the dataviz palette validator and passes, for all pairs in
both modes: lightness band, chroma floor, CVD separation, normal-vision floor, and contrast
against the mode's surface. **Do not substitute these values.**

| Role | Light | Dark |
|---|---|---|
| Canvas (ground) | `#FAFAF9` stone-50 | `#090C0A` ink.canvas |
| Surface (island) | `#FFFFFF` | `#151A18` ink.surface |
| Raised (sheet, menu) | `#FFFFFF` | `#212623` ink.raised |
| Border | `#E7E5E4` stone-200 | `#2E3431` ink.border |
| Text primary | `#1C1917` | `#EEF1EF` |
| Text secondary | `#57534E` | `#A6AAA8` |
| Text muted | `#78716C` | `#888E8B` |
| Protein | `#168BE1` | `#2F9AF2` |
| Carbs | `#C97004` | `#DD7610` |
| Fat | `#9B204A` | `#DA5F8B` |
| Fiber | `#924BAC` | `#9851B2` |

Brand jade: `600 #0C8261` is the floor for white text (4.79:1) — **`jade-500` fails AA at
3.29:1, never put white on it.** Brand text on light uses `jade-700`. In dark mode the brand
goes *up*: `jade-400` fills, `jade-300` sets text, and `brandOn` is near-black.

Status is reserved and never reused as a data series: good `jade-600`/`jade-400`, warning
`#B45309`/`#F59E0B`, critical `#B91C1C`/`#F87171`. Always ship status with an icon **and**
words — never colour alone.

Sugar and sodium are **not** in the categorical palette. Render them neutral stone with a
direct label. Do not invent a fifth hue.

### Dark mode elevates by lightness, not by shadow or blur

The ink ladder is spaced in OKLab lightness so every step is visible on its own:
`0.150 → 0.212 → 0.262 → 0.318`. A card is a card in dark mode because it is *lighter than
the page*, full stop. Shadows are invisible at these levels and blur only muddies them.

*(TG)* Same structure: `--color-background-secondary` is `#0F0F0F` (the ground) and
`--color-background` is `#212121` (surfaces). Surfaces are lighter than the page they sit on.

---

## 5. Typography

Loaded via `@expo-google-fonts/*` subpath imports and `expo-font`.

| Role | Family | Use |
|---|---|---|
| Display | `Fraunces_600SemiBold` / `Fraunces_700Bold` | Every number the user reads as data, plus screen titles |
| UI | `Figtree_400Regular` / `_500Medium` / `_600SemiBold` | Everything else |

**Every data number wears Fraunces.** Calories, macro grams, weights, reps, streaks. This is
the app's signature. Use `<StatValue>` rather than styling text ad hoc — it applies
`fontVariant: ['tabular-nums']`, which React Native has no CSS equivalent for.

Never use the system font stack for data.

---

## 6. Shape and elevation

| Token | Value | Use |
|---|---|---|
| `radius.pill` | `999` | Pills, chips, avatars |
| `radius.sheet` | `32` | Bottom sheets, modals |
| `radius.card` | `24` | Islands, the tab bar |
| `radius.control` | `16` | Buttons, inputs, segmented controls |
| `radius.tight` | `12` | Nested elements inside an island |
| `radius.tiny` | `6` | Badges, inline code, tag chips |

*(TG)* `--border-radius-island` and `--border-radius-pane` are both `1.5rem` (24),
`--border-radius-modal` is `2rem` (32), `--border-radius-button` and
`--border-radius-default` are `1rem` (16), `--border-radius-default-tiny` is `0.375rem` (6).

Shadows are **light mode only**, and they are much softer than instinct suggests.

| Token | Value | Use |
|---|---|---|
| `shadow.island` | `0 1px 4px rgba(0,0,0,0.05)` | Cards and rows |
| `shadow.floating` | `0 1px 6px rgba(0,0,0,0.15)` | FAB, pressed or lifted elements |
| `shadow.chrome` | `0 1px 8px rgba(0,0,0,0.12)` | Tab bar, headers, sheets |

*(TG)* `--shadow-island: 0 1px 4px 0 #0000000D` — five percent. `--shadow-footer:
0 1px 8px 1px rgba(0,0,0,0.12)`. On Android, repeatedly:
`setShadowLayer(dp(6), 0, dp(1), 15% black)`.

React Native needs both halves: `shadowColor` / `shadowOffset` / `shadowOpacity` /
`shadowRadius` for iOS and `elevation` for Android. Ship both, or the shadow exists on one
platform only.

In dark mode, set no shadow at all. Step the surface up the ink ladder instead.

---

## 7. Motion

Motion is where "modern" actually comes from. These are the only durations in the app.

| Token | Duration | Curve | Use |
|---|---|---|---|
| `motion.press` | `120ms` | `easeOut` | Press feedback, opacity |
| `motion.select` | `200ms` | `easeOut` | Tab indicator, chip selection, toggles |
| `motion.fade` | `185ms` | `linear` | Blur and overlay alpha |
| `motion.slide` | `300ms` | `cubic-bezier(0.25, 1, 0.5, 1)` | In-screen reveals, accordions, sheets sliding |
| `motion.layer` | `350ms` | `cubic-bezier(0.16, 1, 0.3, 1)` | Screen push and pop |
| `motion.field` | `500ms` | `cubic-bezier(0.33, 0, 0, 1)` | Ambient field phase advance (§8) |

*(TG)* `--slide-transition: 300ms cubic-bezier(0.25, 1, 0.5, 1)`, `--select-transition: 200ms
ease-out`, and on iOS `--slide-transition: 350ms cubic-bezier(0.16, 1, 0.3, 1)`.
`MotionBackgroundDrawable` advances on `CubicBezierInterpolator(0.33, 0, 0, 1)` over `500ms`.
`BlurBehindDrawable` fades its blur alpha by `0.09` per frame — about `185ms` at 60fps.

Sheets are the one exception and use a spring, not a duration.

Honour `useReducedMotion()`: drop transforms, keep opacity, and never let a reduced-motion
user lose the state change itself.

Haptics on meaningful commits only — set completed, plan accepted, food logged. Never on
scroll or plain navigation.

---

## 8. The ambient field

`Aurora` stays, but it is **not** an app-wide background. It appears on:

- Welcome, login and onboarding — screens with no data, where the field *is* the content.
- The chat screen, as the coach's backdrop.

Nowhere else. Diary, Progress, Workout and Profile sit on flat `canvas`. A drifting colour
field behind a table of figures is noise, and mounting a copy of it per card is what made
dense screens slow.

*(TG)* Telegram's animated gradient is chat wallpaper. It never appears behind the chat list,
settings, or any other screen.

### It should react, not just drift

An idle loop reads as wallpaper. Telegram's reads as alive because it is **event-driven**:
four colour anchor points, eight fixed phase positions, and every message sent advances the
field by one phase.

*(TG)* `MotionBackgroundDrawable` — `colors = {0xff426D57, 0xffF7E48B, 0xff87A284, 0xffFDF6CA}`,
`phase` wraps `0..7`, gradients generated at 60×80px and upscaled, transition `500ms` on
`CubicBezierInterpolator(0.33, 0, 0, 1)` (`300ms` for the fast variant).

MacroFit's equivalent events: a meal logged, a set completed, a weigh-in saved. One phase per
commit, on `motion.field`. The field acknowledging the action is worth more than the drift
ever was.

Generate the field small and upscale it. There is no reason to compute a gradient at device
resolution.

---

## 9. Performance and Lite Mode

A single `liteMode` flag, resolved once per launch, forces every glass surface to its solid
fallback. It turns on when any of these is true:

- Reduce Transparency is enabled.
- Battery saver is on.
- The device is below the low-end threshold.

*(TG)* Telegram ships this as a first-class, user-visible feature: `LiteMode` flags,
`SharedConfig.chatBlurEnabled()`, a device performance class, and `BlurSettingsBottomSheet`
letting the user set blur radius and alpha by hand.

Three rules that come straight from their implementation:

1. **Blur regions, not elements.** `BlurBehindDrawable` keeps exactly two bitmaps — the
   toolbar strip and the panel — for the whole screen. Never one per card.
2. **Downscale hard.** `DOWN_SCALE = 15f`. Blur is a low-frequency effect; resolution is
   wasted on it.
3. **Only recompute when the source actually changed.** `RenderNodeWithHash` hashes the
   content; `LiquidGlassEffect.update` rebuilds its `RenderEffect` only when a uniform moves
   by more than `0.1f`.

Diary and Progress are the screens to measure, on a release build, on a mid-range Android.

---

## 10. Components (`src/components/`)

Build against these; do not re-implement:

`Island` · `SectionGroup` · `Row` · `Glass` · `StatValue` · `Label` · `Button` ·
`IconButton` · `Field` · `Pill` · `ProgressTrack` · `MacroRing` · `Sheet` · `EmptyState` ·
`SectionTitle` · `Aurora`

`Island` is the solid content surface. `Glass` is the floating-chrome material and takes no
children that are not chrome. `SectionGroup` holds `Row`s and draws the inset hairlines
between them.

If a pattern appears three times, it belongs here.

---

## 11. Non-negotiables

- Accessibility: every touchable has `accessibilityLabel` and `accessibilityRole`.
- Touch targets ≥44. Respect safe areas via `react-native-safe-area-context`; the tab bar
  must clear the home indicator, and scroll content must clear the tab bar.
- Never render a fabricated number as a placeholder. Show a real empty state that says what
  to do.
- Weights persist in **kg** always; convert only at the input/display boundary.
- Business logic lives in `../src/utils` (shared with web) — never reimplement a formula in a
  component.
