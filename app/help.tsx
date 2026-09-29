import React, { useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Activity,
  Bookmark,
  ChevronDown,
  Download,
  Scale,
  Search,
  Target,
} from 'lucide-react-native'

import { useTheme, type Theme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Surface } from '@/components/Glass'
import { Body, SectionTitle } from '@/components/Text'
import { Screen } from '@/components/Layout'

/**
 * What the app does, in the user's words rather than the code's.
 *
 * WHY THIS EXISTS:
 * Everything the app knew how to explain about itself lived on the onboarding Welcome step —
 * three lines, shown once, before the person had a single day of data to attach them to. After
 * that there was nothing: no help, no tooltips, no second telling. A design review scored Help
 * and Documentation 1 out of 4 and it was being generous, because the one explainer is
 * unreachable by anyone who has already finished setup.
 *
 * WHY ACCORDIONS RATHER THAN A DOCUMENT:
 * Nobody reads a help screen top to bottom. They arrive with one question — usually "what is
 * the middle number" or "why did my target change" — and everything that is not the answer is
 * in the way. Collapsed headings make the whole set scannable in one screen height, so finding
 * the right question costs a glance instead of a scroll.
 *
 * Several sections can be open at once on purpose. Two of these answers only make sense
 * against each other (where targets come from, and why the verdict disagrees with the scale),
 * and a panel that closed its neighbour would make comparing them a memory exercise.
 *
 * Meal photo analysis used to be the one capability deliberately left undocumented here,
 * because `src/lib/api.ts` could do it and no screen offered it. The assistant's camera
 * button closes that gap, so the logging topic now covers it — including the part where the
 * numbers are an estimate, which is the thing a help screen exists to say out loud.
 */

interface Topic {
  id: string
  icon: React.ReactNode
  title: string
  /** Rendered as separate paragraphs, so no entry needs to carry its own line breaks. */
  body: string[]
}

const buildTopics = (theme: Theme): Topic[] => {
  const icon = (Node: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>) => (
    <Node size={17} color={theme.brandText} strokeWidth={2} />
  )

  return [
    {
      id: 'logging',
      icon: icon(Search),
      title: 'Getting food into the diary',
      body: [
        'Four ways, and they all end up in the same place. Add food searches a built-in list of Indian dishes and everyday foods, and looks up packaged products online when the name is not one it already holds.',
        'The assistant is usually faster for a real meal. Describe it the way you would say it out loud — "two chapatis and chicken curry, and four eggs for snacks" — and it works out the items and the amounts. Every reply that wrote something to your diary carries an Undo, because it acts on its own reading of what you meant.',
        'The camera button in the assistant reads a photo of a plate. It lists what it can see with an estimate for each item, and nothing is written until you confirm it — uncheck anything that was never there, adjust the counts, then log. Estimating from a picture is genuinely approximate, so treat the numbers as a starting point rather than a measurement.',
        'Tap any entry in the Diary to change the serving count, or to remove it. Removing shows a snackbar with a way back for a few seconds.',
      ],
    },
    {
      id: 'ring',
      icon: icon(Target),
      title: 'What the ring is showing',
      body: [
        'The number in the middle is the calories you have eaten today, over your target. It turns red once you pass the target, and the label underneath says so in words.',
        'The three arcs are your macros, reading outside in: protein, carbs, fat. Each one fills against its own target rather than against the calories, so a day can be full on protein and barely started on carbs. The figures below the ring say the same thing in grams for anyone who would rather read it than look at it.',
        'An arc stops at full. The grams underneath do not, so a day that went well past a target still reports the real number.',
      ],
    },
    {
      id: 'targets',
      icon: icon(Activity),
      title: 'Where your targets come from',
      body: [
        'Setup asked for age, height, weight, how active your days are and what you are trying to do. From those, the app estimates what your body burns in a day, then turns that into a calorie target and a protein, carb and fat split.',
        'That first estimate is a formula, and the app labels it Predicted because that is all it is. Once you have logged enough days of food alongside enough weigh-ins, it can work out what you actually burn by comparing the two — how much you ate against which way the weight moved. That figure is labelled Measured, and the coach prefers it as soon as there is enough behind it to trust.',
        'You can override any of it. Profile has a Daily targets section that opens the screen where you type the numbers you want; nothing the coach proposes reaches your daily targets until you accept it.',
      ],
    },
    {
      id: 'verdict',
      icon: icon(Scale),
      title: 'The weight line, and why it argues with the scale',
      body: [
        'Bodyweight moves several hundred grams a day on water, salt and what is still being digested. A single weigh-in cannot tell that noise apart from a real change, which is why the app reads the trend across days rather than the last number you entered.',
        'That is what the line under the ring is reporting. "Stalled" means the trend has been flat long enough that it is not noise. "Going the wrong way" means it is moving against what you asked for. Neither is a comment on today.',
        'Weigh in as often as you like, at any time of day. More entries make the trend steadier, not noisier.',
      ],
    },
    {
      id: 'saved',
      icon: icon(Bookmark),
      title: 'Meals you eat over and over',
      body: [
        'Log a meal once, then tap the bookmark on that meal card and give it a name. It becomes a saved meal.',
        'After that it is one tap to drop every item of it into any day, with the same servings. Saved meals sit at the top of the Diary once you have one, since by then they are the fastest way to log.',
      ],
    },
    {
      id: 'health',
      icon: icon(Activity),
      title: 'Steps and Health Connect',
      body: [
        'Health Connect is the Google app that holds steps and bodyweight on your phone, and decides which apps may read them. It is optional. MacroFit works fully without it.',
        'With it connected, your step count appears on the dashboard and your weigh-ins can be written back out to whatever else you use. If you granted some permissions and not others, the app says exactly which one is missing rather than reporting itself as disconnected.',
        'Steps are shown for context. They are not subtracted from your calorie target, because the estimate a phone makes of calories burned is far rougher than the target it would be adjusting.',
      ],
    },
    {
      id: 'updates',
      icon: icon(Download),
      title: 'Updating the app',
      body: [
        'This build is installed directly rather than from an app store, so nothing notices a new version on its own. Open Profile and use App version to check.',
        'A new version downloads inside the app, then hands the file to Android, which asks you before installing anything. Your diary, weigh-ins and workouts are kept.',
      ],
    },
  ]
}

/**
 * One question, collapsed until asked.
 *
 * The chevron rotates rather than swapping to a second icon: it is the same control in two
 * states, and two icons would read as two controls.
 */
const TopicRow: React.FC<{ topic: Topic; open: boolean; onToggle: () => void }> = ({
  topic,
  open,
  onToggle,
}) => {
  const theme = useTheme()

  return (
    <Surface style={{ padding: spacing.lg, gap: open ? spacing.md : 0 }}>
      <Pressable
        needsOffscreenAlphaCompositing
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        // No "Expand"/"Collapse" verb in the label: accessibilityState already carries it, and
        // saying both makes the announcement read "Collapse, expanded, button".
        accessibilityLabel={topic.title}
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          /*
            The Surface's padding belongs to the Surface, not to this Pressable — the tap box is
            this box only. Subtracting the padding from HIT_SIZE assumed otherwise and produced
            a 34dp target, set by the icon rather than by the minimum.
          */
          minHeight: HIT_SIZE,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: radius.tight,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.border,
          }}
        >
          {topic.icon}
        </View>

        <Body size={15} weight="semibold" style={{ flex: 1 }}>
          {topic.title}
        </Body>

        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <ChevronDown size={18} color={theme.textMuted} strokeWidth={2.2} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ gap: spacing.md }}>
          {topic.body.map((paragraph, index) => (
            <Body key={index} size={15} tone="secondary">
              {paragraph}
            </Body>
          ))}
        </View>
      ) : null}
    </Surface>
  )
}

export default function HelpScreen() {
  const theme = useTheme()
  const router = useRouter()
  const topics = buildTopics(theme)

  // A Set rather than a single id, so two answers that explain each other can be read together.
  const [open, setOpen] = useState<Set<string>>(() => new Set())

  const toggle = (id: string) =>
    setOpen(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Screen
      title="How it works"
      subtitle="What the numbers mean, and where they come from"
      onBack={() => router.back()}
    >
      {topics.map(topic => (
        <TopicRow
          key={topic.id}
          topic={topic}
          open={open.has(topic.id)}
          onToggle={() => toggle(topic.id)}
        />
      ))}

      <View
        style={{
          gap: spacing.sm,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: theme.border,
          padding: spacing.lg,
        }}
      >
        <SectionTitle style={{ fontSize: 15 }}>Still stuck?</SectionTitle>
        <Body size={13} tone="secondary">
          Setup can be re-run at any time from Profile. It re-asks the questions your targets are
          built from and recalculates them. Nothing you have logged is touched.
        </Body>
      </View>
    </Screen>
  )
}
