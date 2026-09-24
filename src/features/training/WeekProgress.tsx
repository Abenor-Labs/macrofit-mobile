import React from 'react'
import { View } from 'react-native'
import { Check, Flame } from 'lucide-react-native'

import type { WeeklyProgress } from '@core/utils/trainingStats'

import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, Label, StatValue } from '@/components/Text'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/**
 * This week against the plan's goal, and the run of weeks kept.
 *
 * The line under the count is the hook: "2 to go" is a reason to open the app on Thursday,
 * "Goal hit" is a reason to feel good about having done so. It never scolds — a week that is
 * behind says how many are left, not that you are failing.
 */
export const WeekProgressCard: React.FC<{ progress: WeeklyProgress }> = ({ progress }) => {
  const theme = useTheme()
  const { goal, done, days, todayIndex, streakWeeks } = progress
  const left = Math.max(0, goal - done)

  return (
    <Surface style={{ padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Label>This week</Label>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <StatValue size={24} color={left === 0 ? theme.brandText : theme.text}>
              {done}
            </StatValue>
            <Body size={15} tone="secondary">{`of ${goal} workouts`}</Body>
          </View>
          <Body size={13} weight="semibold" style={{ color: left === 0 ? theme.brandText : theme.textSecondary }}>
            {left === 0 ? 'Weekly goal hit' : left === 1 ? 'One more to hit your goal' : `${left} to go`}
          </Body>
        </View>
        {streakWeeks > 0 ? (
          <View
            accessibilityLabel={`${streakWeeks} week streak`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: radius.pill,
              backgroundColor: `${theme.brand}1F`,
            }}
          >
            <Flame size={15} color={theme.brandText} strokeWidth={2.4} />
            <Body size={13} weight="semibold" style={{ color: theme.brandText }}>
              {`${streakWeeks}-week streak`}
            </Body>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((trained, index) => {
          const isToday = index === todayIndex
          return (
            <View key={index} style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: trained ? theme.brand : theme.surfaceRaised,
                  borderWidth: isToday && !trained ? 2 : 0,
                  borderColor: theme.brand,
                }}
              >
                {trained ? <Check size={17} color={theme.brandOn} strokeWidth={3} /> : null}
              </View>
              <Label style={isToday ? { color: theme.brandText } : undefined}>{LETTERS[index]}</Label>
            </View>
          )
        })}
      </View>
    </Surface>
  )
}
