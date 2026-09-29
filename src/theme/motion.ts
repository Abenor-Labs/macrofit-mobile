import { Easing } from 'react-native-reanimated'

import { motion } from './tokens'

/**
 * Reanimated easings built from the motion tokens, so no component spells a curve out.
 * tokens.ts stays plain data; this is the one place the curves become functions.
 */
export const enterEasing = Easing.bezier(...motion.enter.bezier)
export const ENTER_MS = motion.enter.duration
