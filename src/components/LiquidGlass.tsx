import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { BlurTargetView, BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'

import { useTheme } from '@/theme/useTheme'
import { radius as R } from '@/theme/tokens'

/**
 * Liquid glass: a pane that refracts what is behind it, rather than merely frosting it.
 *
 * WHAT SEPARATES THIS FROM `GlassSurface`:
 * `Glass.tsx` is the app's everyday frosted material — a blur, a tint, an edge. It sits still
 * over still content, which is all a card needs. This is the material for the one surface
 * where the *displacement* is the point: light bending at the pane's edge, the backdrop
 * visibly warping under it as the two move relative to each other. It costs more and it is
 * only worth paying where something is actually moving behind the glass.
 *
 * THREE RENDERING PATHS, and it matters which one a device gets:
 *
 *   1. iOS 26+ — Apple's own Liquid Glass, via `expo-glass-effect`. This is the only path
 *      with true per-pixel refraction, edge bulge and specular response, and it is the only
 *      one where `LiquidGlassGroup` can morph neighbouring panes into each other.
 *   2. Everywhere else — the backdrop is redrawn inside the pane, magnified about the pane's
 *      own centre, and THAT copy is blurred. Both halves are load-bearing and for a while
 *      only one of them shipped: displacement alone is a crisp offset nobody notices over a
 *      soft field, and blur alone is frosting that says translucent rather than solid. Bent
 *      first, scattered second, plus a bright top rim and a shadowed bottom one for thickness.
 *      Not per-pixel refraction, but a real optical result rather than a painted impression,
 *      and it is what Android actually ships.
 *   3. Reduce Transparency on — an opaque raised surface, no blur, no rim. Someone who has
 *      asked the system to stop layering translucency has asked for exactly that.
 *
 * The Android blur is only real because of the `BlurTargetView` in `LiquidGlassScene`; see
 * the long note in `BlurTarget.tsx` for why expo-blur needs one. Without a scene, path 2
 * degrades to the same flat scrim `GlassSurface` draws, which is a legible material but not
 * a refracting one.
 */

/** Whether the platform can draw Apple's Liquid Glass. Fixed for the process. */
const HAS_LIQUID_GLASS = isLiquidGlassAvailable()

/**
 * `true` while the user has Reduce Transparency enabled.
 *
 * Checked continuously rather than once at mount: it is a Settings toggle, and someone who
 * turns it on because a screen is illegible expects the screen they are looking at to
 * change. Android always reports `false`, so the listener is inert there.
 */
const useReduceTransparency = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let alive = true
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (alive) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduced
    )
    return () => {
      alive = false
      subscription.remove()
    }
  }, [])

  return reduced
}

/**
 * Which material the panes below will actually draw.
 *
 * Exported because callers have to design for the answer, not just pass it through: a
 * screen whose whole point is refraction needs to say something different when the device
 * cannot refract, and a screen that animates its backdrop purely to feed the glass should
 * not pay for that animation when nothing is sampling it.
 */
export const useGlassMaterial = (): 'liquid' | 'blur' | 'opaque' => {
  const reduceTransparency = useReduceTransparency()
  if (reduceTransparency) return 'opaque'
  return HAS_LIQUID_GLASS ? 'liquid' : 'blur'
}

/**
 * The view the fallback blur samples. `undefined` outside a `LiquidGlassScene`, and until
 * the scene's backdrop has laid out.
 *
 * A *new* ref object per target, for the reason spelled out in `BlurTarget.tsx`: BlurView
 * re-resolves its native target only when the ref object's `current` differs from the
 * previous prop's, so a single ref mutated in place is silently ignored.
 */
const SceneTargetContext = createContext<React.RefObject<View | null> | undefined>(undefined)

/**
 * Everything a pane needs to draw the backdrop a second time, in register with the first.
 *
 * `origin` is the scene's top-left in window coordinates. A pane measures itself the same
 * way and subtracts, which gives its offset inside the scene without either of them caring
 * how many scroll views and safe-area wrappers sit in between.
 */
interface SceneRefraction {
  backdrop: React.ReactNode
  origin: { x: number; y: number }
  size: { width: number; height: number }
}

const SceneRefractionContext = createContext<SceneRefraction | null>(null)

/**
 * How many panes deep this subtree already is. 0 means "directly on the scene".
 *
 * WHY THE MATERIAL ENFORCES THIS RATHER THAN THE DESIGN DOC:
 * Once buttons, inputs and pills became glass, every one of them inside a glass card became
 * a pane inside a pane — and a nested pane is not merely wasteful, it is destructive. It
 * stacks a second veil and a second pair of rim gradients over a region the parent has
 * already tinted, which is how the ghost button on the login screen lost its label
 * completely. The old §1 said "never nest one inside another: two blur passes composite into
 * mud"; that rule was right and lived only in prose, so it did not survive the rollout.
 *
 * A nested pane therefore drops the lens and the rims and keeps only a light tint and an
 * edge. It still reads as glass, because the parent underneath it is genuinely refracting —
 * it is a facet of that pane, not a second pane. It is also very close to free, which is
 * what keeps a screen of glass rows affordable.
 */
const PaneDepthContext = createContext(0)

export interface LiquidGlassSceneProps {
  /**
   * What the glass refracts. Rendered behind everything, filling the scene, and declared to
   * the platform as the thing to sample — so it must be the moving, high-contrast content
   * the panes sit over, never the panes themselves.
   */
  backdrop: React.ReactNode
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * Pairs a backdrop with the panes that refract it.
 *
 * Self-contained on purpose. The app's other blur runs through `BlurTargetProvider`, which
 * exists because the tab bar renders outside the screen it samples; here the backdrop and
 * the glass are siblings in one screen, so routing the target through global state would
 * add a focus race for nothing.
 *
 * A pane must never be rendered *inside* `backdrop`: a blur view cannot be part of its own
 * target, and on Android that produces either a feedback smear or nothing at all.
 */
export const LiquidGlassScene: React.FC<LiquidGlassSceneProps> = ({
  backdrop,
  children,
  style,
}) => {
  const ref = useRef<View | null>(null)
  const [target, setTarget] = useState<View | null>(null)
  /*
    Bumped on every layout of the backdrop, purely to mint a fresh ref object below.

    The view exists before it has been measured, and on Android a target with no dimensions
    resolves to nothing — so the first pane can come up empty and stay that way, because
    BlurView only re-resolves when `prevProps.blurTarget?.current` differs from the new
    prop's. Re-publishing the same view inside a *new* object is the only signal it acts on.
    Same trap `BlurTarget.tsx` documents, reached from the other direction.
  */
  const [layouts, setLayouts] = useState(0)
  const targetRef = useMemo(
    () => (target ? { current: target } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `layouts` is the point: it exists
    // only to force a new object out of this memo when the view behind it has been measured.
    [target, layouts]
  )

  // The scene's own position and size in window coordinates, so panes can line a second
  // copy of the backdrop up with the first. Measured rather than assumed: the scene does not
  // know what padding or safe-area wrapper it was mounted inside.
  const [frame, setFrame] = useState<SceneRefraction['origin'] & SceneRefraction['size']>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  const refraction = useMemo<SceneRefraction>(
    () => ({
      backdrop,
      origin: { x: frame.x, y: frame.y },
      size: { width: frame.width, height: frame.height },
    }),
    [backdrop, frame]
  )

  /*
    Measured off the scene's own outer View, not off the BlurTargetView.

    BlurTargetView is a native component whose ref does not carry `measureInWindow`, and
    calling it there throws "undefined is not a function" at mount. The outer View is a plain
    RN View, is exactly the same rect, and has the method.
  */
  const sceneRef = useRef<View | null>(null)

  const measureScene = () => {
    sceneRef.current?.measureInWindow((x, y, width, height) => {
      setFrame(current =>
        current.x === x &&
        current.y === y &&
        current.width === width &&
        current.height === height
          ? current
          : { x, y, width, height }
      )
    })
  }

  return (
    <View ref={sceneRef} onLayout={measureScene} style={[{ flex: 1 }, style]}>
      <BlurTargetView
        ref={ref}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        onLayout={() => {
          setTarget(ref.current)
          setLayouts(n => n + 1)
          measureScene()
        }}
      >
        {backdrop}
      </BlurTargetView>
      <SceneTargetContext.Provider value={targetRef}>
        <SceneRefractionContext.Provider value={refraction}>
          {children}
        </SceneRefractionContext.Provider>
      </SceneTargetContext.Provider>
    </View>
  )
}

export interface LiquidGlassGroupProps {
  children: React.ReactNode
  /**
   * How close two panes must come before they start to merge, in points.
   *
   * Only iOS 26 honours it — this is the "liquid" half of liquid glass, where neighbouring
   * panes bleed into one another like droplets before they touch. Elsewhere the group is a
   * plain view and the panes stay separate, so a layout must read correctly *unmerged*;
   * treat the merge as a reward for the devices that can draw it, never as the thing
   * holding the composition together.
   */
  spacing?: number
  style?: StyleProp<ViewStyle>
}

export const LiquidGlassGroup: React.FC<LiquidGlassGroupProps> = ({
  children,
  spacing,
  style,
}) => {
  const material = useGlassMaterial()
  if (material !== 'liquid') return <View style={style}>{children}</View>
  return (
    <GlassContainer spacing={spacing} style={style}>
      {children}
    </GlassContainer>
  )
}

export interface LiquidGlassPaneProps {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Corner radius. Defaults to the card radius. */
  radius?: number
  /**
   * `clear` is thinner and lets far more of the backdrop through — right when the pane
   * carries a word or two over deliberate colour. `regular` is the readable default and the
   * only sane choice under a paragraph.
   */
  variant?: 'regular' | 'clear'
  /**
   * Let the pane respond to touch on iOS 26 with the system's own highlight.
   *
   * Set it only on a pane that is genuinely pressable, and never on one that merely sits
   * behind something pressable — a surface that lights up under a finger and then does
   * nothing is worse than one that never moved.
   */
  interactive?: boolean
  /**
   * The hairline around the pane. On by default.
   *
   * Turn it off only where the pane's edge is already described by something else — a
   * divider, a screen edge — because without an edge a refracting pane reads as a rendering
   * fault rather than as a material. Same rule the old `GlassSurface` stated.
   */
  bordered?: boolean
  /**
   * Colour the glass instead of veiling it neutrally — Apple's "tinted" Liquid Glass.
   *
   * The pane still refracts underneath; this only replaces the near-transparent white/black
   * veil with a colour. It exists for one reason: a primary action cannot be clear glass.
   * `brandOn` text over a lens showing a moving colour field has no contrast floor at all,
   * and MOBILE-DESIGN §2 fixes that floor at 4.79:1. A tint at high alpha keeps the
   * refraction visible at the edges while giving the label the same ground it had when the
   * button was solid.
   *
   * Pass a colour with its own alpha; opaque colours will simply hide the lens.
   */
  tint?: string
}

/**
 * One pane of glass.
 *
 * Carries no background colour of its own on the liquid path: a fill, even a translucent
 * one, is composited *over* the refraction and flattens the exact thing being paid for.
 */
export const LiquidGlassPane: React.FC<LiquidGlassPaneProps> = ({
  children,
  style,
  radius = R.card,
  variant = 'regular',
  interactive = false,
  bordered = true,
  tint,
}) => {
  const theme = useTheme()
  const material = useGlassMaterial()
  const depth = useContext(PaneDepthContext)
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' }
  // Everything below this pane is one level deeper, whichever path draws it.
  const deeper = (node: React.ReactNode) => (
    <PaneDepthContext.Provider value={depth + 1}>{node}</PaneDepthContext.Provider>
  )

  if (material === 'liquid') {
    return (
      <GlassView
        glassEffectStyle={variant}
        isInteractive={interactive}
        tintColor={tint}
        /*
          The app's dark mode is its own persisted toggle, not the system appearance (see
          `useTheme`), so `auto` would put a light pane on a dark screen for anyone whose two
          settings disagree.
        */
        colorScheme={theme.mode}
        style={[shape, style]}
      >
        {deeper(children)}
      </GlassView>
    )
  }

  if (material === 'opaque') {
    return (
      <View
        style={[
          shape,
          {
            backgroundColor: theme.surfaceRaised,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: theme.border,
          },
          style,
        ]}
      >
        {deeper(children)}
      </View>
    )
  }

  return (
    <RefractingPane
      shape={shape}
      style={style}
      radius={radius}
      bordered={bordered}
      tint={tint}
      nested={depth > 0}
    >
      {deeper(children)}
    </RefractingPane>
  )
}

/**
 * The non-Apple path: an actual lens, not a rim trick.
 *
 * WHY THIS IS NOT JUST A BLUR:
 * A blur cannot produce displacement. Blurring a smooth gradient returns the same smooth
 * gradient, so a frosted pane laid over a soft colour field shows exactly what sits beside
 * it and the material vanishes — which is precisely how the first version of this screen
 * looked on device: three near-white cards with a shadow.
 *
 * What the eye actually reads as glass is CONTENT NOT LINING UP ACROSS THE EDGE. So the pane
 * draws the backdrop a second time, magnified about the pane's own centre. Inside the pane
 * the field is pushed outward by `MAGNIFY`; outside it is not; and the mismatch at the
 * boundary is a real optical displacement rather than a suggestion of one. That is the same
 * thing Apple's material does per-pixel, done once per pane with a transform.
 *
 * The rim still earns its place on top: real glass gathers light on the edge facing the
 * source and drops it on the opposite one, and that bright-to-dark pairing is what turns a
 * displaced patch into a solid object with thickness.
 *
 * Cost: one extra copy of the backdrop per pane. That is why `Aurora` is three gradient
 * views and no blur of its own, and why this material is restricted to one screen.
 */

/**
 * How much the pane magnifies what is behind it.
 *
 * 1.06 while the copy was sharp, because past about 1.12 a crisp offset duplicate stops
 * reading as refraction and starts reading as a misregistered layer.
 *
 * The copy is blurred now, which is exactly the thing that was missing — "a real lens blurs
 * as it bends and this one does not" was the note here, and it was describing a bug. With
 * frost on top, the artefact that capped this disappears and the displacement can be pushed
 * far enough to actually be seen.
 */
const MAGNIFY = 1.14

const RefractingPane: React.FC<{
  children?: React.ReactNode
  shape: ViewStyle
  style?: StyleProp<ViewStyle>
  radius: number
  bordered: boolean
  tint?: string
  nested: boolean
}> = ({ children, shape, style, radius, bordered, tint, nested }) => {
  const theme = useTheme()
  const g = theme.glass
  const scene = useContext(SceneRefractionContext)
  const blurTarget = useContext(SceneTargetContext)
  const ref = useRef<View | null>(null)
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null
  )

  /*
    The pane's own blur target: the displaced copy it draws for itself. Same
    new-object-per-layout dance as the scene, for the same reason — BlurView only re-resolves
    when the ref object's `current` differs from the previous prop's.
  */
  const lensRef = useRef<View | null>(null)
  const [lensLayouts, setLensLayouts] = useState(0)
  const lensTargetRef = useMemo(
    () => (lensRef.current ? { current: lensRef.current } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lensLayouts` is the point: it
    // exists only to mint a fresh object once the copy has been measured.
    [lensLayouts]
  )

  /*
    KNOWN LIMITATION: the lens is measured on layout, not on scroll.

    So the refracted image is anchored to the pane rather than to the world, and a card
    scrolling past the field shows the same patch of backdrop the whole way. Physically it
    should reveal new content as it travels.

    Left alone deliberately. Fixing it means re-measuring every pane on every scroll frame,
    which on a screen of glass rows is a per-frame layout pass per card — far more expensive
    than the artefact is visible, because the backdrop is a smooth field and the error is a
    slow drift rather than a jump. Revisit only if the backdrop ever gains hard detail.
  */
  const measure = () => {
    ref.current?.measureInWindow((x, y, width, height) => {
      setRect(current =>
        current &&
        current.x === x &&
        current.y === y &&
        current.width === width &&
        current.height === height
          ? current
          : { x, y, width, height }
      )
    })
  }

  /*
    Scaling a view happens about its own centre, so a plain `scale` on the copy would
    magnify about the middle of the SCREEN and slide the backdrop sideways under panes near
    the edges. Re-centring on the pane is the correction:

      scale about C maps P -> C + s(P - C)
      we want    about O maps P -> O + s(P - O)
      difference = (C - O)(s - 1)

    where C is the copy's centre and O is the pane's centre, both in scene coordinates.
  */
  const lens = (() => {
    if (!scene || !rect || scene.size.width === 0) return null
    const offsetX = rect.x - scene.origin.x
    const offsetY = rect.y - scene.origin.y
    const paneCentreX = offsetX + rect.width / 2
    const paneCentreY = offsetY + rect.height / 2
    return {
      left: -offsetX,
      top: -offsetY,
      width: scene.size.width,
      height: scene.size.height,
      translateX: (scene.size.width / 2 - paneCentreX) * (MAGNIFY - 1),
      translateY: (scene.size.height / 2 - paneCentreY) * (MAGNIFY - 1),
    }
  })()

  // Before measurement, assume a card-ish pane so the first frame is not rimless.
  const rimHeight = Math.min(radius, Math.max(4, (rect?.height ?? radius * 4) * 0.28))

  return (
    <View
      ref={ref}
      onLayout={measure}
      style={[
        shape,
        /*
          The border is ALWAYS declared; `bordered` only decides whether it is visible.

          Dropping `borderWidth` entirely puts this view on a different Android draw path, and
          a rounded `overflow: hidden` view with no border whose only content is translucent
          renders as nothing at all — pane, tint and children included. Reproduced on device:
          with `tint` set it drew fine, with a border it drew fine, with neither it vanished.
          A transparent 0-alpha border costs nothing and keeps one predictable path.
        */
        {
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: bordered ? g.border : 'transparent',
        },
        style,
      ]}
    >
      {/*
        BLUR *AND* DISPLACEMENT, not one or the other.

        This was a ternary — lens when measured, blur otherwise — which meant the blur was
        switched off the instant the lens started working, i.e. always. What shipped was a
        6%-magnified copy of the backdrop under a tint: real displacement, zero frost. At the
        scale of one card, over a soft gradient, a 6% offset is close to invisible, so every
        surface in the app read as a flat tinted panel. Glass needs both, because the two do
        different jobs — displacement says "there is something solid here", blur says "and you
        are looking THROUGH it".

        The trick is the pane owning its own blur target. `BlurTargetView` declares the
        displaced copy as the thing to sample and the `BlurView` beside it — a sibling, never
        a child, since a blur view cannot be part of its own target — blurs exactly that. So
        the frost is applied to the refracted image rather than to the undisplaced page, which
        is the correct order optically: light bends first, scatters second.

        On iOS the same tree works for free, because a BlurView there blurs whatever is behind
        it in the hierarchy and the copy is behind it.
      */}
      {nested ? null : (
        <>
          <BlurTargetView
            ref={lensRef}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
            onLayout={() => setLensLayouts(n => n + 1)}
          >
            {lens ? (
              <View
                style={{
                  position: 'absolute',
                  left: lens.left,
                  top: lens.top,
                  width: lens.width,
                  height: lens.height,
                  transform: [
                    { translateX: lens.translateX },
                    { translateY: lens.translateY },
                    { scale: MAGNIFY },
                  ],
                }}
              >
                {scene?.backdrop}
              </View>
            ) : null}
          </BlurTargetView>
          <BlurView
            tint={g.tint}
            intensity={g.intensity}
            /*
              Its own copy when there is one, the scene's otherwise. The fallback covers the
              frames before this pane has measured itself, and any pane used outside a scene —
              both of which still get real frost, just without the refraction.
            */
            blurTarget={lens ? lensTargetRef : blurTarget}
            blurReductionFactor={1}
            blurMethod={
              Platform.OS === 'android'
                ? (lens ? lensTargetRef : blurTarget)
                  ? 'dimezisBlurViewSdk31Plus'
                  : 'none'
                : undefined
            }
            style={StyleSheet.absoluteFill}
          />
        </>
      )}

      {/*
        A whisper of tint, not a coat of it.

        This was `chromeOverlay` at 0.30 white, stacked under an 0.85 white highlight and on
        top of expo-blur's own `tint` veil — three white layers, which is how a working blur
        ended up looking like an opaque card. The displaced copy underneath has to stay
        visible or none of the work above it counts.
      */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            /*
              A nested pane veils far more lightly. The parent has already tinted this exact
              region, so repeating it at full strength is what buried the ghost button's
              label — two 0.18 whites over a pale card leave nothing for 15pt secondary text
              to sit against. An explicit `tint` always wins, because a caller that asked for
              a colour asked for it at that strength.
            */
            backgroundColor:
              tint ??
              (nested
                ? theme.mode === 'dark'
                  ? 'rgba(238,241,239,0.06)'
                  : 'rgba(255,255,255,0.28)'
                : theme.mode === 'dark'
                  /*
                    0.34, up from 0.22. The backdrop now carries real luminance range — it
                    has to, or nothing refracts — and that range lands under the text as
                    well as under the material. This is the floor that keeps `textMuted`
                    legible over the bright half of an orb without dulling the displacement,
                    because a tint darkens the whole copy uniformly and leaves the offset at
                    the pane's edge exactly as visible as it was.
                  */
                  ? 'rgba(9,12,10,0.34)'
                  : 'rgba(255,255,255,0.22)'),
          },
        ]}
      />

      {/*
        Light entering the top edge, sized to the pane rather than to its corner radius.

        `radius` was standing in for "how thick does this glass look", which holds for a 24pt
        card and falls apart on a 44pt-tall button: a 16pt rim top and bottom is most of the
        control, so it stopped reading as glass and started reading as a 2010 gloss gradient.
        28% of the height keeps the proportion honest at any size.
      */}
      {nested ? null : (
        <LinearGradient
          colors={[g.highlight, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: rimHeight }}
        />
      )}
      {/*
        And leaving the bottom, darker.

        The colour has to flip with the mode, and picking one for both is the trap: on dark
        the page ink IS the shadow, but `canvas` in light mode is stone-50 — using it here
        paints a second BRIGHT edge and the pane goes flat, which is the opposite of the
        effect. Light mode borrows the text ink instead, at a fraction of the strength.
      */}
      {nested ? null : (
        <LinearGradient
          colors={['transparent', theme.mode === 'dark' ? theme.canvas : theme.text]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: rimHeight,
            opacity: theme.mode === 'dark' ? 0.32 : 0.1,
          }}
        />
      )}

      {children}
    </View>
  )
}
