import React, { useState } from 'react'
import { Pressable, View } from 'react-native'
import { ChevronLeft, Dumbbell, PersonStanding, Plus } from 'lucide-react-native'

import type { TrainingStyle } from '@core/types'
import { presetsFor, type ProgramPreset } from '@core/data/programPresets'
import { getTodayString } from '@core/utils/calculations'

import { useStore } from '@/store/useStore'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, SectionTitle } from '@/components/Text'
import { Button } from '@/components/Button'

export const STYLE_LABEL: Record<TrainingStyle, string> = {
  gym: 'Gym',
  calisthenics: 'Calisthenics',
}

const STYLES: {
  style: TrainingStyle
  title: string
  detail: string
  Icon: typeof Dumbbell
}[] = [
  {
    style: 'gym',
    title: 'Gym',
    detail: 'Barbells, dumbbells and machines. Splits like chest, back, arms and legs.',
    Icon: Dumbbell,
  },
  {
    style: 'calisthenics',
    title: 'Calisthenics',
    detail: 'Your bodyweight: pull-ups, dips, push-ups, squats. Train anywhere.',
    Icon: PersonStanding,
  },
]

/**
 * First visit to Training, and "add a program" after that.
 *
 * Two questions, one per screen's worth of attention: how do you train, then which split.
 * Every preset is editable afterwards, so the choice is a starting point, not a commitment —
 * the copy says so, because a user who thinks they are signing up to a plan hesitates.
 */
export const ProgramSetup: React.FC<{
  /** Skip the first question when the caller already knows the style (Plan's segmented). */
  style?: TrainingStyle
}> = ({ style: fixedStyle }) => {
  const theme = useTheme()
  const createProgram = useStore(s => s.createProgram)
  const [chosen, setChosen] = useState<TrainingStyle | null>(fixedStyle ?? null)
  const style = fixedStyle ?? chosen

  if (style === null) {
    return (
      <View style={{ gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <SectionTitle>How do you train?</SectionTitle>
          <Body size={15} tone="secondary">
            Pick one to get a ready-made schedule. You can add the other later.
          </Body>
        </View>
        {STYLES.map(({ style: value, title, detail, Icon }) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${title}. ${detail}`}
            onPress={() => setChosen(value)}
          >
            {({ pressed }) => (
              <Surface
                style={{
                  padding: spacing.lg,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.lg,
                  borderColor: pressed ? theme.brand : undefined,
                }}
              >
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: `${theme.brand}22`,
                  }}
                >
                  <Icon size={28} color={theme.brandText} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Body size={17} weight="semibold">
                    {title}
                  </Body>
                  <Body size={13} tone="secondary">
                    {detail}
                  </Body>
                </View>
              </Surface>
            )}
          </Pressable>
        ))}
      </View>
    )
  }

  const start = (preset: ProgramPreset | null) =>
    createProgram(style, preset?.id ?? null, getTodayString())

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {fixedStyle === undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose a different way to train"
            onPress={() => setChosen(null)}
            hitSlop={8}
            style={{ width: 32, height: HIT_SIZE, justifyContent: 'center', marginLeft: -6 }}
          >
            <ChevronLeft size={24} color={theme.text} strokeWidth={2.2} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, gap: 2 }}>
          <SectionTitle>{`Pick a ${STYLE_LABEL[style].toLowerCase()} split`}</SectionTitle>
          <Body size={13} tone="secondary">
            It repeats in order. Every day and lift can be changed later.
          </Body>
        </View>
      </View>

      {presetsFor(style).map(preset => (
        <Surface key={preset.id} style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ gap: 2 }}>
            <Body size={17} weight="semibold">
              {preset.name}
            </Body>
            <Body size={13} tone="secondary">
              {preset.summary}
            </Body>
          </View>
          {/* The cycle itself, so the choice is made on what the week looks like. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {preset.days.map((day, index) => (
              <View
                key={index}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: radius.pill,
                  backgroundColor: day ? theme.surfaceRaised : 'transparent',
                  borderWidth: day ? 0 : 1,
                  borderColor: theme.border,
                }}
              >
                <Label style={{ color: day ? theme.text : theme.textMuted, letterSpacing: 0.4 }}>
                  {day ? day.name : 'Rest'}
                </Label>
              </View>
            ))}
          </View>
          <Button label="Use this split" variant="secondary" full haptic onPress={() => start(preset)} />
        </Surface>
      ))}

      <Button
        label="Build my own from scratch"
        variant="ghost"
        full
        onPress={() => start(null)}
        icon={<Plus size={16} color={theme.textSecondary} strokeWidth={2.2} />}
      />
    </View>
  )
}
