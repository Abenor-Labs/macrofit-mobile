import React from 'react'
import { ThemeOverride } from './useTheme'
import type { Theme } from './tokens'

/**
 * Forces one palette on everything rendered inside it.
 *
 * Exists so workout mode can be a change of paint rather than a fork of the component
 * library. Surface, Button, Field, Body, MacroRing and the rest all read `useTheme()`, so
 * wrapping a screen is enough to repaint it — there is no second set of components to keep
 * in step, and a fix to a shared control lands in both modes at once.
 */
export const ThemeScope: React.FC<{ theme: Theme; children: React.ReactNode }> = ({
  theme,
  children,
}) => <ThemeOverride.Provider value={theme}>{children}</ThemeOverride.Provider>
