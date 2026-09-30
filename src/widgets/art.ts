/*
  The widget's drawings, as SVG strings.

  A widget is not a React Native view: it is drawn once into a bitmap by the launcher's
  process, so react-native-svg and the lucide components cannot run there. These are the same
  shapes, written out — the ring matches MacroRing, and the icons are lucide's own path data
  (ISC licence), so the widget and the app draw the same marks.
*/

export interface RingArc {
  /** 0..1; clamped for drawing. */
  progress: number
  color: string
}

/**
 * Concentric arcs from 12 o'clock, clockwise, outermost first — MacroRing's geometry at widget
 * scale.
 *
 * Arcs are explicit paths from the top rather than rotated, dashed circles: where a circle's
 * stroke begins is up to the renderer, and the widget's (AndroidSVG) begins it somewhere other
 * than 3 o'clock, so the rotation that works in the app set every arc off from 9.
 */
export const ringSvg = (size: number, strokeWidth: number, track: string, arcs: RingArc[]): string => {
  const c = size / 2
  const gap = strokeWidth + Math.max(2, Math.round(strokeWidth / 2))
  const shapes = arcs
    .map((arc, i) => {
      const r = c - strokeWidth / 2 - i * gap
      if (r <= 0) return ''
      const stroke = `fill="none" stroke-width="${strokeWidth}"`
      const ring = `<circle cx="${c}" cy="${c}" r="${r}" ${stroke} stroke="${track}"/>`
      const p = Math.max(0, Math.min(1, arc.progress))
      // Nothing to draw: a round cap on a zero-length arc would still paint a dot.
      if (p * 2 * Math.PI * r < 0.5) return ring
      // A full arc's ends meet, which an SVG arc command cannot describe; it is a circle.
      if (p >= 0.999) return `${ring}<circle cx="${c}" cy="${c}" r="${r}" ${stroke} stroke="${arc.color}"/>`
      const angle = p * 2 * Math.PI
      const x = (c + r * Math.sin(angle)).toFixed(2)
      const y = (c - r * Math.cos(angle)).toFixed(2)
      const large = angle > Math.PI ? 1 : 0
      return `${ring}<path d="M ${c} ${c - r} A ${r} ${r} 0 ${large} 1 ${x} ${y}" ${stroke} stroke="${arc.color}" stroke-linecap="round"/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${shapes}</svg>`
}

type IconNode = readonly (readonly [tag: 'path' | 'circle', attrs: Record<string, string>])[]

const ICONS = {
  utensils: [
    ['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }],
    ['path', { d: 'M7 2v20' }],
    ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }],
  ],
  camera: [
    [
      'path',
      {
        d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
      },
    ],
    ['circle', { cx: '12', cy: '13', r: '3' }],
  ],
  droplets: [
    [
      'path',
      {
        d: 'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z',
      },
    ],
    [
      'path',
      {
        d: 'M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97',
      },
    ],
  ],
  dumbbell: [
    [
      'path',
      {
        d: 'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
      },
    ],
    ['path', { d: 'm2.5 21.5 1.4-1.4' }],
    ['path', { d: 'm20.1 3.9 1.4-1.4' }],
    [
      'path',
      {
        d: 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
      },
    ],
    ['path', { d: 'm9.6 14.4 4.8-4.8' }],
  ],
  play: [['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }]],
} as const satisfies Record<string, IconNode>

export type IconName = keyof typeof ICONS

export const iconSvg = (name: IconName, size: number, color: string): string => {
  const body = (ICONS[name] as IconNode)
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')
      return `<${tag} ${attributes}/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
}
