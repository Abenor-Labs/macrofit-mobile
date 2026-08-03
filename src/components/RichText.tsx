import React from 'react'
import { View } from 'react-native'

import { spacing } from '@/theme/tokens'
import { Body } from './Text'

/**
 * Renders the small amount of Markdown that reaches this app from outside it.
 *
 * WHY THIS EXISTS RATHER THAN A MARKDOWN LIBRARY:
 * Two surfaces receive text written elsewhere: the assistant's replies, and the release notes
 * GitHub returns with an update. Both are Markdown and both used to render through a plain
 * `<Body>`, so headings showed as literal hashes, bold as literal asterisks, and the
 * assistant's three-column tables as rows of pipes.
 *
 * The answer is not a parser that can draw tables. A three-column table is unreadable in a
 * bubble roughly three hundred points wide whether it is parsed or not, so the assistant's
 * prompt forbids them outright and this drops any that arrive anyway. What is left is worth
 * rendering: bold carries the number that answers the question, and bullets carry a list.
 *
 * WHY EVERY LINE IS A BARE `<Body>` AND NOTHING USES FLEXBOX:
 * The first version wrapped each line in a `flexDirection: 'row'` View so a bullet could sit
 * in its own column, with `flex: 1` on the text beside it. That broke every chat bubble.
 *
 * The bubble has `maxWidth: '92%'` and no width, inside a column that uses
 * `alignItems: 'flex-start'`, so it sizes itself to its content. Text can answer "how wide are
 * you" from the string. A View cannot: it asks its children, and a child with `flex: 1` asks
 * to fill its parent. Parent and child each waited on the other and the result collapsed to
 * the narrowest thing that still fits, which is one character, so replies rendered as a
 * vertical column of single letters and short messages became empty slivers.
 *
 * So the bullet is a character at the head of the same string, and every line measures itself.
 * The cost is that a wrapped bullet does not hang-indent under its own text. That is a small
 * thing to trade for the bubble having a width at all.
 */
export const RichText: React.FC<{
  text: string
  color: string
  size?: number
}> = ({ text, color, size = 14 }) => {
  const lines: React.ReactNode[] = []

  /*
    Strip tool-call markup the server failed to parse out of its own reply.

    The closing tag is optional on purpose. Markup reaches this component precisely when the
    server's parse went wrong or a response was truncated, which is the same situation that
    loses the closing tag — requiring it would make the pattern miss the case it exists for.
    Attributes are allowed and the match is case-insensitive for the same reason: this is
    salvage, not a grammar.
  */
  const cleaned = text.replace(/<toolcall\b[^>]*>[\s\S]*?(?:<\/toolcall>|$)/gi, '').trim()
  if (cleaned === '') return null

  cleaned.split('\n').forEach((raw, index) => {
    // Table rows and the dashed separator beneath them.
    if (/^\s*\|/.test(raw) || /^\s*\|?[\s:-]*-{3,}[\s:|-]*$/.test(raw)) return

    const line = raw.replace(/^\s*#{1,6}\s*/, '').trimEnd()
    if (line.trim() === '') return

    const bullet = /^\s*([-*•]|\d+\.)\s+/.exec(line)
    const content = bullet ? line.slice(bullet[0].length) : line
    /*
      A numbered list keeps its numbers. Rewriting '1.' '2.' '3.' to three identical dots
      destroys the one thing an ordered list carries that an unordered one does not, and the
      assistant uses them for steps the user is meant to follow in order.
    */
    const marker = bullet ? (bullet[1].endsWith('.') ? `${bullet[1]} ` : '• ') : ''

    // Splitting on the bold delimiter keeps the delimited runs, at the odd indices.
    const parts = content.split(/\*\*(.+?)\*\*/g)

    lines.push(
      <Body key={index} size={size} style={{ color }}>
        {marker}
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <Body key={i} size={size} weight="semibold" style={{ color }}>
              {part}
            </Body>
          ) : (
            // Leftover emphasis and code markers, meaningless once bold is handled.
            part.replace(/[*_`]/g, '')
          ),
        )}
      </Body>,
    )
  })

  /*
    Every line was a table row or blank. Show what is left rather than nothing at all — but
    show the *cleaned* string, not the original. Falling back to `text` handed the raw
    `<toolcall>` JSON straight to the screen for any reply that was markup plus a table,
    which is exactly the reply this strip exists to catch.
  */
  if (lines.length === 0) {
    return (
      <Body size={size} style={{ color }}>
        {cleaned}
      </Body>
    )
  }

  // One line is the common case — a user's message, or a short reply. Return it unwrapped so
  // the bubble sees text directly and sizes to it, exactly as it did before any of this.
  if (lines.length === 1) return <>{lines[0]}</>

  return <View style={{ gap: spacing.xs }}>{lines}</View>
}
