import React from 'react'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { formatNumber } from '@/lib/formatNumber'
import { iconSvg, ringSvg, type IconName } from './art'
import { widgetLink, TODAY_ROUTE } from './links'
import { WIDGET_WATER_ML, type TodayModel } from './model'
import { FONT, type WidgetPalette } from './palette'

/*
  Calories left, the macro ring, and the three things logged most, one tap each.

  Four layouts by size, because a launcher lets the widget be dragged anywhere from one row
  to half a screen:
    strip   — one row high: the number left and the three log buttons.
    compact — two cells wide: the ring, with the number under it.
    regular — the default 4×2: the ring, the number and protein beside it, the log buttons
              under both. Carbs and fat are in the ring; protein gets words because it is the
              macro this app's users fall short on, and the one the coach talks about.
    tall    — 4×3 and up: all three macros written out.

  "Left" rather than the app ring's "eaten of target": the question someone glancing at a home
  screen is asking is how much of the day remains.

  Every height budget below is the sum of what it holds (text line heights, not font sizes),
  so a layout is only picked when its content fits — nothing overflows into the crop.
*/

const PAD = 12
const BUTTON = 34
const BUTTON_GAP = 8

export interface WidgetSize {
  width: number
  height: number
}

const todayUri = { uri: widgetLink(TODAY_ROUTE) }

interface Action {
  key: string
  icon: IconName
  label: string
  /** For a button too narrow for `label`. */
  shortLabel: string
  accessibilityLabel: string
  click: { clickAction: string; clickActionData?: Record<string, unknown> }
}

const ACTIONS: Action[] = [
  {
    key: 'food',
    icon: 'utensils',
    label: 'Food',
    shortLabel: 'Food',
    accessibilityLabel: 'Log food',
    click: { clickAction: 'OPEN_URI', clickActionData: { uri: widgetLink('/food-search') } },
  },
  {
    key: 'photo',
    icon: 'camera',
    label: 'Photo',
    shortLabel: 'Photo',
    accessibilityLabel: 'Log a meal from a photo',
    click: { clickAction: 'OPEN_URI', clickActionData: { uri: widgetLink('/chat?snap=camera') } },
  },
  {
    // Written by the widget's background task without opening the app: water is the one log
    // that needs no decision, so it should not cost an app launch.
    key: 'water',
    icon: 'droplets',
    label: `+${WIDGET_WATER_ML} ml`,
    shortLabel: 'Water',
    accessibilityLabel: `Log ${WIDGET_WATER_ML} ml of water`,
    click: { clickAction: 'ADD_WATER' },
  },
]

type DayModel = Extract<TodayModel, { kind: 'day' }>

const Headline: React.FC<{
  model: DayModel
  palette: WidgetPalette
  size: number
  /** Stacked under the number, or beside it on one line. */
  layout: 'stacked' | 'inline'
}> = ({ model, palette, size, layout }) => {
  const over = model.eaten > model.goal
  const value = over ? model.eaten - model.goal : Math.max(0, model.goal - model.eaten)
  const stacked = layout === 'stacked'
  return (
    <FlexWidget
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'center' : 'flex-end',
      }}
    >
      <TextWidget
        text={formatNumber(value)}
        allowFontScaling={false}
        maxLines={1}
        style={{ fontFamily: FONT.display, fontSize: size, color: over ? palette.critical : palette.text }}
      />
      <TextWidget
        text={over ? 'kcal over' : 'kcal left'}
        allowFontScaling={false}
        maxLines={1}
        style={{
          fontFamily: FONT.medium,
          fontSize: 12,
          color: palette.textMuted,
          ...(stacked ? {} : { marginLeft: 5, marginBottom: Math.round(size / 6) }),
        }}
      />
    </FlexWidget>
  )
}

const Ring: React.FC<{ model: DayModel; palette: WidgetPalette; size: number }> = ({ model, palette, size }) => {
  const stroke = Math.max(5, Math.round(size / 12))
  const color = { Protein: palette.macro.protein, Carbs: palette.macro.carbs, Fat: palette.macro.fat }
  return (
    <SvgWidget
      style={{ width: size, height: size }}
      svg={ringSvg(
        size,
        stroke,
        palette.track,
        model.macros.map(m => ({ progress: m.grams / Math.max(m.goal, 1), color: color[m.key] }))
      )}
    />
  )
}

const MacroRow: React.FC<{ label: string; value: string; color: `#${string}`; palette: WidgetPalette }> = ({
  label,
  value,
  color,
  palette,
}) => (
  <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
    <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />
    <TextWidget
      text={label}
      allowFontScaling={false}
      maxLines={1}
      style={{ fontFamily: FONT.medium, fontSize: 12, color: palette.textSecondary }}
    />
    <FlexWidget style={{ flex: 1 }} />
    <TextWidget
      text={value}
      allowFontScaling={false}
      maxLines={1}
      style={{ fontFamily: FONT.semibold, fontSize: 12, color: palette.text, marginLeft: 8 }}
    />
  </FlexWidget>
)

const ActionButton: React.FC<{
  action: Action
  palette: WidgetPalette
  /** Omitted: an icon-only round button. */
  width?: number
}> = ({ action, palette, width }) => (
  <FlexWidget
    {...action.click}
    accessibilityLabel={action.accessibilityLabel}
    style={{
      height: BUTTON,
      width: width ?? BUTTON,
      borderRadius: BUTTON / 2,
      backgroundColor: palette.chip,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <SvgWidget svg={iconSvg(action.icon, 15, palette.chipText)} style={{ width: 15, height: 15 }} />
    {width === undefined ? null : (
      <TextWidget
        text={width >= 72 ? action.label : action.shortLabel}
        allowFontScaling={false}
        maxLines={1}
        style={{ fontFamily: FONT.semibold, fontSize: 12, color: palette.chipText, marginLeft: 5 }}
      />
    )}
  </FlexWidget>
)

/** "0.25 L", "1.5 L": the day's water, short enough for a button. */
const litres = (ml: number) => `${Number((ml / 1000).toFixed(2))} L`

const ActionRow: React.FC<{ palette: WidgetPalette; width: number; waterMl: number; water: string }> = ({
  palette,
  width,
  waterMl,
  water,
}) => {
  const each = Math.floor((width - BUTTON_GAP * (ACTIONS.length - 1)) / ACTIONS.length)
  return (
    <FlexWidget style={{ width, flexDirection: 'row', flexGap: BUTTON_GAP }}>
      {ACTIONS.map(action => (
        <ActionButton
          key={action.key}
          width={each}
          palette={palette}
          action={
            action.key === 'water'
              ? {
                  ...action,
                  // Once there is water logged the button carries the day's total, so a tap
                  // shows its effect where the finger is: 0.25 L, 0.5 L, 0.75 L.
                  ...(waterMl > 0 ? { label: litres(waterMl), shortLabel: litres(waterMl) } : {}),
                  accessibilityLabel: `${action.accessibilityLabel}. ${water} so far.`,
                }
              : action
          }
        />
      ))}
    </FlexWidget>
  )
}

/** The card, sized to the drawing area rather than stretched to the launcher's report. */
const Shell: React.FC<{
  palette: WidgetPalette
  size: WidgetSize
  children: React.ReactNode
  accessibilityLabel: string
}> = ({ palette, size, children, accessibilityLabel }) => (
  <FlexWidget
    clickAction="OPEN_URI"
    clickActionData={todayUri}
    accessibilityLabel={accessibilityLabel}
    style={{
      width: size.width,
      height: size.height,
      backgroundColor: palette.surface,
      borderRadius: 24,
      padding: PAD,
    }}
  >
    {children}
  </FlexWidget>
)

export const TodayWidget: React.FC<{ model: TodayModel; size: WidgetSize; palette: WidgetPalette }> = ({
  model,
  size,
  palette,
}) => {
  const inner = { width: size.width - PAD * 2, height: size.height - PAD * 2 }

  if (model.kind === 'empty') {
    return (
      <Shell palette={palette} size={size} accessibilityLabel="Open MacroFit to set your targets">
        <FlexWidget style={{ width: inner.width, height: inner.height, justifyContent: 'center' }}>
          <TextWidget
            text="MacroFit"
            allowFontScaling={false}
            style={{ fontFamily: FONT.display, fontSize: 18, color: palette.text }}
          />
          <TextWidget
            text="Open the app to set your targets."
            allowFontScaling={false}
            maxLines={2}
            style={{ fontFamily: FONT.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 }}
          />
        </FlexWidget>
      </Shell>
    )
  }

  const over = model.eaten > model.goal
  const summary = over
    ? `${formatNumber(model.eaten - model.goal)} kilocalories over today's ${formatNumber(model.goal)}`
    : `${formatNumber(Math.max(0, model.goal - model.eaten))} kilocalories left of ${formatNumber(model.goal)}`
  const label = `${summary}. Open Today.`
  const water = `${(model.waterMl / 1000).toFixed(1)} of ${(model.waterGoalMl / 1000).toFixed(1)} L`

  /*
    One row high: the 20pt number over its label (26 + 16), and as many round buttons as fit
    beside it — all three from four cells wide, then water alone (the log that needs no
    screen), then none. The number is the one thing a strip is never without.
  */
  if (inner.height < 72) {
    const numberWidth = 64
    const fit = Math.floor((inner.width - numberWidth + 6) / (BUTTON + 6))
    const shown = fit >= 3 ? ACTIONS : fit >= 1 ? ACTIONS.filter(a => a.key === 'water') : []
    return (
      <Shell palette={palette} size={size} accessibilityLabel={label}>
        <FlexWidget
          style={{ width: inner.width, height: inner.height, flexDirection: 'row', alignItems: 'center' }}
        >
          <FlexWidget style={{ flex: 1 }}>
            <Headline model={model} palette={palette} size={20} layout="stacked" />
          </FlexWidget>
          {shown.length > 0 ? (
            <FlexWidget style={{ flexDirection: 'row', flexGap: 6 }}>
              {shown.map(action => (
                <ActionButton key={action.key} action={action} palette={palette} />
              ))}
            </FlexWidget>
          ) : null}
        </FlexWidget>
      </Shell>
    )
  }

  // Two cells wide: the ring, and the number under it (6 + 26 + 16).
  if (inner.width < 176) {
    const ring = Math.max(40, Math.min(96, inner.width, inner.height - 48))
    return (
      <Shell palette={palette} size={size} accessibilityLabel={label}>
        <FlexWidget
          style={{ width: inner.width, height: inner.height, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ring model={model} palette={palette} size={ring} />
          <FlexWidget style={{ marginTop: 6 }}>
            <Headline model={model} palette={palette} size={20} layout="stacked" />
          </FlexWidget>
        </FlexWidget>
      </Shell>
    )
  }

  const actions = BUTTON + 10
  // Tall: headline (31) + 4 + three macro rows (3 × 16 + 2 × 3) = 89 beside the ring.
  const tall = inner.height - actions >= 96
  const top = inner.height - actions
  const ring = Math.max(44, Math.min(tall ? 110 : 76, top))
  const macroColor = { Protein: palette.macro.protein, Carbs: palette.macro.carbs, Fat: palette.macro.fat }
  const lines = tall ? model.macros : model.macros.filter(m => m.key === 'Protein')

  return (
    <Shell palette={palette} size={size} accessibilityLabel={label}>
      <FlexWidget style={{ width: inner.width, height: inner.height }}>
        <FlexWidget style={{ width: inner.width, height: top, flexDirection: 'row', alignItems: 'center' }}>
          <Ring model={model} palette={palette} size={ring} />
          <FlexWidget style={{ flex: 1, marginLeft: 12 }}>
            <Headline model={model} palette={palette} size={tall ? 26 : 22} layout="inline" />
            <FlexWidget style={{ width: 'match_parent', marginTop: 4, flexGap: 3 }}>
              {lines.map(m => (
                <MacroRow
                  key={m.key}
                  label={m.key}
                  value={`${Math.round(m.grams)} / ${Math.round(m.goal)} g`}
                  color={macroColor[m.key]}
                  palette={palette}
                />
              ))}
            </FlexWidget>
          </FlexWidget>
        </FlexWidget>
        <FlexWidget style={{ marginTop: 10 }}>
          <ActionRow palette={palette} width={inner.width} waterMl={model.waterMl} water={water} />
        </FlexWidget>
      </FlexWidget>
    </Shell>
  )
}
