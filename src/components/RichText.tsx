import React from 'react'
import { View } from 'react-native'

import { spacing } from '@/theme/tokens'
import { Body } from './Text'

/**
 * Renders the small amount of Markdown that reaches this app from outside it.
 *
 * WHY THIS EXISTS RATHER THAN A MARKDOWN LIBRARY:
 * Two surfaces receive text written elsewhere: the AI assistant's replies, and the release
 * notes GitHub hands back with an update. Both arrive as Markdown and both used to be rendered
 * through a plain `<Body>`, so headings showed as literal hashes, bold as literal asterisks,
 * and the assistant's three-column tables as pipes.
 *
 * The answer is not a parser that can draw tables. A three-column table is unreadable in a
 * bubble roughly three hundred points wide whether it is parsed or not, so the assistant's
 * prompt forbids them outright (see the web repo's api/chat.ts) and this drops any that slip
 * through anyway. What is left is worth rendering: bold carries the number that answers the
 * question, and bullets carry a list.
 *
 * Headings are stripped rather than styled. A six-line reply has nothing to organise, and a
 * heading in a chat bubble is padding. Release notes do use them meaningfully, but their
 * hierarchy survives the loss better than the reader survives seeing `###`.
 *
 * Anything unrecognised falls through as plain text, so a construct nobody anticipated degrades
 * to something readable rather than to punctuation.
 */
export const RichText: React.FC<{
  text: string
  color: string
  size?: number
}> = ({ text, color, size = 14 }) => {
  const blocks: React.ReactNode[] = []

  text.split('\n').forEach((raw, index) => {
    // Table rows and the dashed separator under them.
    if (/^\s*\|/.test(raw) || /^\s*\|?[\s:-]*-{3,}[\s:|-]*$/.test(raw)) return

    const line = raw.replace(/^\s*#{1,6}\s*/, '').trimEnd()
    if (line.trim() === '') return

    const bullet = /^\s*([-*•]|\d+\.)\s+/.exec(line)
    const content = bullet ? line.slice(bullet[0].length) : line

    // Splitting on the bold delimiter keeps the delimited runs, at the odd indices.
    const parts = content.split(/\*\*(.+?)\*\*/g)

    blocks.push(
      <View
        key={index}
        style={{ flexDirection: 'row', gap: bullet ? spacing.xs : 0, alignItems: 'flex-start' }}
      >
        {bullet ? (
          <Body size={size} style={{ color, opacity: 0.7 }}>
            {'•'}
          </Body>
        ) : null}
        <Body size={size} style={{ flex: 1, color }}>
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <Body key={i} size={size} weight="semibold" style={{ color }}>
                {part}
              </Body>
            ) : (
              // Leftover emphasis and code markers, which carry no meaning once bold is handled.
              part.replace(/[*_`]/g, '')
            ),
          )}
        </Body>
      </View>,
    )
  })

  // Every line was a table row or blank. Show the original rather than an empty box.
  if (blocks.length === 0) {
    return (
      <Body size={size} style={{ color }}>
        {text}
      </Body>
    )
  }

  return <View style={{ gap: spacing.xs }}>{blocks}</View>
}
