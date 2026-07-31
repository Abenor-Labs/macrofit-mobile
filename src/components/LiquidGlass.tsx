import React, { useMemo } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia'
import { useTheme } from '@/theme/useTheme'

/**
 * The specular shell that turns a frosted panel into a liquid-glass one.
 *
 * WHAT THIS IS NOT:
 * It does not refract the content behind it, and that is a platform limit rather than a
 * shortcut. A Skia shader can only sample what Skia itself drew into the same canvas, so
 * bending a React Native ScrollView through it is not possible — the RN view tree is Fabric
 * views, not Skia primitives. (The same constraint is why Compose's GlassContainer needs the
 * background to be Compose content, and why expo-glass-effect ships no Android implementation
 * at all.) The one workaround, snapshotting the backdrop with makeImageFromView and refracting
 * the bitmap, is stale the moment the user scrolls — which is precisely when a tab bar is being
 * looked at. A frozen reflection of where the list used to be reads as a bug, not as glass.
 *
 * WHAT IT DOES INSTEAD:
 * Everything in Apple's material except the refraction, live at frame rate. ChromeBlur supplies
 * the real blurred backdrop underneath; this draws the glass *body* on top — a rounded-rect
 * signed distance field, edge normals taken from its gradient, a specular term from those
 * normals, and a rim light along the boundary. The centre stays fully transparent so the blur
 * below is untouched. The effect of thickness comes from the lighting, which is most of what
 * separates "liquid" from "frosted" to the eye.
 *
 * Cheap on purpose: no sampling, no snapshots, no offscreen passes — one fragment shader over
 * the chrome's own small rect.
 */

const SOURCE = `
uniform float2 u_size;
uniform float u_radius;
uniform float u_band;
uniform float2 u_light;
uniform float u_specular;
uniform float u_rim;
uniform float4 u_sheen;

// Signed distance to a rounded rectangle: negative inside, zero on the edge.
float sdRoundRect(float2 p, float2 half_size, float r) {
  float2 q = abs(p) - half_size + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 main(float2 xy) {
  float2 half_size = u_size * 0.5;
  float2 p = xy - half_size;

  float d = sdRoundRect(p, half_size, u_radius);

  // Outside the shape contributes nothing; the chrome's own clip also handles this, but a
  // shader that returns garbage off-shape is a shader that breaks the moment it is reused.
  if (d > 0.0) {
    return half4(0.0);
  }

  // How far into the glass we are, 0 at the edge and 1 once past the lit band.
  float depth = clamp(-d / max(u_band, 0.0001), 0.0, 1.0);

  // Edge normal from the SDF gradient. Near the boundary this points out of the surface, which
  // is what gives the band its curvature; central pixels have no gradient worth lighting.
  float e = 1.0;
  float2 grad = float2(
    sdRoundRect(p + float2(e, 0.0), half_size, u_radius) -
      sdRoundRect(p - float2(e, 0.0), half_size, u_radius),
    sdRoundRect(p + float2(0.0, e), half_size, u_radius) -
      sdRoundRect(p - float2(0.0, e), half_size, u_radius)
  );
  float2 n = normalize(grad + float2(0.0, 0.0001));

  // Curvature falls off across the band, so the highlight sits on the bevel rather than
  // flooding the whole panel.
  float bevel = 1.0 - depth;

  // Specular: brightest where the bevel faces the light.
  float facing = clamp(dot(n, normalize(u_light)), 0.0, 1.0);
  float spec = pow(facing, 3.0) * bevel * u_specular;

  // Rim: a thin bright line hugging the boundary itself, independent of light direction. This
  // is the part that reads as a physical edge catching light.
  float rim = smoothstep(1.0, 0.0, depth / 0.35) * u_rim;

  float alpha = clamp(spec + rim, 0.0, 1.0) * u_sheen.a;

  // Premultiplied, which is what Skia expects back from main().
  return half4(u_sheen.rgb * alpha, alpha);
}
`

const effect = Skia.RuntimeEffect.Make(SOURCE)

export interface LiquidGlassProps {
  width: number
  height: number
  /** Match the corner radius of the surface this sits inside, or the bevel lands off-edge. */
  radius?: number
  /** Width in px of the lit bevel band. Wider reads as thicker glass. */
  band?: number
  style?: StyleProp<ViewStyle>
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  width,
  height,
  radius = 0,
  band = 18,
  style,
}) => {
  const theme = useTheme()

  const uniforms = useMemo(
    () => ({
      u_size: [width, height],
      u_radius: radius,
      u_band: band,
      // Light from above and slightly left, matching the highlight direction GlassSurface
      // already uses for its top edge so the two do not disagree on where the sun is.
      u_light: [-0.35, -1],
      u_specular: theme.mode === 'light' ? 0.5 : 0.65,
      u_rim: theme.mode === 'light' ? 0.32 : 0.42,
      u_sheen: theme.mode === 'light' ? [1, 1, 1, 0.9] : [1, 1, 1, 0.75],
    }),
    [width, height, radius, band, theme.mode]
  )

  // Skia compiles the shader at module load. If that ever fails the panel should still render
  // as the frosted surface it already is, rather than taking the screen down with it.
  if (!effect || width <= 0 || height <= 0) return null

  return (
    <Canvas style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Fill>
        <Shader source={effect} uniforms={uniforms} />
      </Fill>
    </Canvas>
  )
}
