import React from 'react'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { formatNumber } from '@/lib/formatNumber'
import { iconSvg, type IconName } from './art'
import { SHOW_FOOD, SHOW_TRAIN } from './half'
import { PHOTO_ROUTE, TODAY_ROUTE, widgetLink } from './links'
import { WIDGET_WATER_ML, type Half, type OneModel, type TrainFace } from './model'
import { FONT, type WidgetPalette } from './palette'
import { Headline, MacroRow, Ring, type DayModel, type WidgetSize } from './TodayWidget'
import { Dots } from './TrainingWidget'

/*
  MacroFit: the whole day on one card, one half at a time.

  The food half is Today's ring and number. The training half reads like a logbook page: what
  is up next with last time's weights, or the set that is open right now. The card shows the
  half the moment calls for — training once a due session is close, or while one is running —
  and the other half is one tap away.

  Four buttons, the same four in the same places on both halves, so a thumb learns them once:
    Food   logs food; on the training half it brings the food half back
    Photo  logs a meal from a photo
    Water  adds 250 ml without opening the app
    Train  shows the training half; on it, it starts or resumes the session
  Only the highlighted one changes.

  Size handling follows TodayWidget: every layout is picked by the height its content needs,
  so nothing is drawn into the part a launcher crops.
*/

const PAD = 12
const BUTTON = 34
const BUTTON_GAP = 6
/** The buttons' row with the gap above it. */
const ACTION_ROW = BUTTON + 10
/** An 11pt caption's line. */
const CAPTION = 15
/** A 12pt row's line, and the gap between rows. */
const ROW = 16
const ROW_GAP = 3

interface Hand {
  key: 'food' | 'photo' | 'water' | 'train'
  icon: IconName
  label: string
  /** For a button too narrow for `label`. */
  shortLabel: string
  accessibilityLabel: string
  click: { clickAction: string; clickActionData?: Record<string, unknown> }
  lit: boolean
}

type DayOne = Extract<OneModel, { kind: 'day' }>

const open = (route: string) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: widgetLink(route) } })

/** "0.25 L", "1.5 L". */
const litres = (ml: number) => `${Number((ml / 1000).toFixed(2))} L`

/** What the fourth button does on the training half. */
const trainAction = (face: TrainFace): Pick<Hand, 'icon' | 'label' | 'shortLabel' | 'accessibilityLabel' | 'click' | 'lit'> => {
  switch (face.kind) {
    case 'plan':
      return {
        icon: 'play',
        label: 'Start',
        shortLabel: 'Start',
        accessibilityLabel: `Start ${face.label}`,
        click: open(`/training?start=${encodeURIComponent(face.dayId)}`),
        lit: true,
      }
    case 'live':
      return { icon: 'play', label: 'Resume', shortLabel: 'Go', accessibilityLabel: 'Resume the workout', click: open('/training'), lit: true }
    case 'no-plan':
      return { icon: 'dumbbell', label: 'Set up', shortLabel: 'Plan', accessibilityLabel: 'Set up a training plan', click: open('/training'), lit: true }
    default:
      return { icon: 'dumbbell', label: 'Train', shortLabel: 'Train', accessibilityLabel: 'Open Training', click: open('/training'), lit: false }
  }
}

const handsFor = (model: DayOne, half: Half): Hand[] => {
  const water = model.food.waterMl
  return [
    half === 'food'
      ? {
          key: 'food',
          icon: 'utensils',
          label: 'Food',
          shortLabel: 'Food',
          accessibilityLabel: 'Log food',
          click: open('/food-search'),
          // After a workout the card is asking for protein; this is how it gets eaten.
          lit: model.afterWorkout !== null,
        }
      : {
          key: 'food',
          icon: 'utensils',
          label: 'Food',
          shortLabel: 'Food',
          accessibilityLabel: 'Show calories and macros',
          click: { clickAction: SHOW_FOOD },
          lit: false,
        },
    {
      key: 'photo',
      icon: 'camera',
      label: 'Photo',
      shortLabel: 'Photo',
      accessibilityLabel: 'Log a meal from a photo',
      click: open(PHOTO_ROUTE),
      lit: false,
    },
    {
      key: 'water',
      icon: 'droplets',
      // Once there is water logged the button carries the day's total, so a tap shows its
      // effect where the finger is.
      label: water > 0 ? litres(water) : `+${WIDGET_WATER_ML} ml`,
      shortLabel: water > 0 ? litres(water) : 'Water',
      accessibilityLabel: `Log ${WIDGET_WATER_ML} ml of water. ${litres(water)} so far.`,
      click: { clickAction: 'ADD_WATER' },
      lit: false,
    },
    half === 'food'
      ? {
          key: 'train',
          icon: 'dumbbell',
          label: 'Train',
          shortLabel: 'Train',
          accessibilityLabel: 'Show training',
          click: { clickAction: SHOW_TRAIN },
          lit: false,
        }
      : { key: 'train', ...trainAction(model.train) },
  ]
}

const HandButton: React.FC<{ hand: Hand; palette: WidgetPalette; width?: number; size?: number }> = ({
  hand,
  palette,
  width,
  size = BUTTON,
}) => {
  const ink = hand.lit ? palette.accentOn : palette.chipText
  return (
    <FlexWidget
      {...hand.click}
      accessibilityLabel={hand.accessibilityLabel}
      style={{
        height: size,
        width: width ?? size,
        borderRadius: size / 2,
        backgroundColor: hand.lit ? palette.accent : palette.chip,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SvgWidget svg={iconSvg(hand.icon, 15, ink)} style={{ width: 15, height: 15 }} />
      {width === undefined ? null : (
        <TextWidget
          text={width >= 72 ? hand.label : hand.shortLabel}
          allowFontScaling={false}
          maxLines={1}
          style={{ fontFamily: FONT.semibold, fontSize: 12, color: ink, marginLeft: 5 }}
        />
      )}
    </FlexWidget>
  )
}

const Caption: React.FC<{ text: string; palette: WidgetPalette }> = ({ text, palette }) => (
  <TextWidget
    text={text}
    allowFontScaling={false}
    maxLines={1}
    truncate="END"
    style={{ fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 0.8, color: palette.textSecondary }}
  />
)

/** A captioned figure that is not calories: protein to go after a workout. */
const Figure: React.FC<{ caption: string; value: string; palette: WidgetPalette; size: number }> = ({
  caption,
  value,
  palette,
  size,
}) => (
  <FlexWidget>
    <Caption text={caption} palette={palette} />
    <TextWidget
      text={value}
      allowFontScaling={false}
      maxLines={1}
      style={{ fontFamily: FONT.display, fontSize: size, color: palette.text }}
    />
  </FlexWidget>
)

/* ---------- Food half ---------- */

const FoodFace: React.FC<{ model: DayOne; palette: WidgetPalette; width: number; height: number }> = ({
  model,
  palette,
  width,
  height,
}) => {
  const food: DayModel = model.food
  // Beside the ring: the caption, the number's line, then rows of 16, 3 apart.
  const column = (numberLine: number, rows: number) =>
    CAPTION + numberLine + (rows > 0 ? 4 + rows * ROW + (rows - 1) * ROW_GAP : 0)
  const tall = height >= column(31, 3)
  const color = { Protein: palette.macro.protein, Carbs: palette.macro.carbs, Fat: palette.macro.fat }

  const over = food.eaten > food.goal
  const kcalRow = {
    key: 'kcal',
    label: over ? 'Kcal over' : 'Kcal left',
    value: formatNumber(over ? food.eaten - food.goal : food.goal - food.eaten),
    color: over ? palette.critical : palette.accent,
  }
  const macroRows = food.macros.map(m => ({
    key: m.key,
    label: m.key,
    value: `${Math.round(m.grams)} / ${Math.round(m.goal)} g`,
    color: color[m.key],
  }))
  // After a workout protein is the headline, so its row gives way to calories.
  const pool = model.afterWorkout !== null ? [kcalRow, ...macroRows.filter(r => r.key !== 'Protein')] : macroRows
  const fit = tall ? 3 : height >= column(27, 1) ? 1 : 0
  const rows = pool.slice(0, fit)
  // The ring gives way before the column does: "Protein  182 / 182 g" needs about 136 across.
  const ring = Math.max(40, Math.min(tall ? 110 : 76, height, width - 12 - 136))

  return (
    <FlexWidget style={{ width, height, flexDirection: 'row', alignItems: 'center' }}>
      <Ring model={food} palette={palette} size={ring} />
      <FlexWidget style={{ flex: 1, marginLeft: 12 }}>
        {model.afterWorkout !== null ? (
          <Figure caption="PROTEIN TO GO" value={`${model.afterWorkout} g`} palette={palette} size={tall ? 26 : 22} />
        ) : (
          <Headline model={food} palette={palette} size={tall ? 26 : 22} align="start" />
        )}
        {rows.length > 0 ? (
          <FlexWidget style={{ width: 'match_parent', marginTop: 4, flexGap: ROW_GAP }}>
            {rows.map(r => (
              <MacroRow key={r.key} label={r.label} value={r.value} color={r.color} palette={palette} />
            ))}
          </FlexWidget>
        ) : null}
      </FlexWidget>
    </FlexWidget>
  )
}

/* ---------- Training half ---------- */

interface TrainText {
  caption: string
  title: string
  /** Rows under the title, most important first: left label, right value. */
  rows: { left: string; right: string; dim?: boolean; quiet?: boolean }[]
  /** Sets done of total, drawn as a bar under the rows of a live session. */
  progress: { done: number; total: number } | null
  accessibilityLabel: string
}

const trainText = (face: TrainFace, rowsThatFit: number): TrainText => {
  switch (face.kind) {
    case 'plan': {
      const shown =
        face.lifts.length > rowsThatFit && rowsThatFit > 0
          ? [
              ...face.lifts.slice(0, rowsThatFit - 1).map(l => ({ left: l.name, right: l.last ? `last ${l.last}` : '', dim: true })),
              { left: `and ${face.lifts.length - (rowsThatFit - 1)} more`, right: '', quiet: true },
            ]
          : face.lifts.map(l => ({ left: l.name, right: l.last ? `last ${l.last}` : '', dim: true }))
      return {
        caption: 'UP NEXT',
        title: face.label,
        rows: shown,
        progress: null,
        accessibilityLabel: `${face.label} is up next${face.lifts.length > 0 ? `: ${face.lifts.map(l => l.name).join(', ')}` : ''}.`,
      }
    }
    case 'live':
      return {
        caption: `IN PROGRESS · ${face.minutes} MIN`,
        title: face.lift ?? 'Every set ticked',
        rows: face.lift
          ? [
              face.liftSets > 0
                ? { left: `Set ${face.setNo} of ${face.liftSets}`, right: face.prefill ?? '', dim: true }
                : { left: 'No sets yet', right: '' },
            ]
          : [{ left: 'Finish it in the app', right: '' }],
        progress: { done: face.done, total: face.total },
        accessibilityLabel: `${face.name} in progress, ${face.done} of ${face.total} sets done.${face.lift ? ` Next: ${face.lift}, set ${face.setNo}${face.prefill ? `, ${face.prefill}` : ''}.` : ''}`,
      }
    case 'done':
      return {
        caption: 'DONE TODAY',
        title: face.name,
        rows: [
          { left: `${face.sets} ${face.sets === 1 ? 'set' : 'sets'}`, right: face.volume ?? '' },
          ...(face.pr ? [{ left: 'New best', right: face.pr }] : face.next ? [{ left: 'Next', right: face.next }] : []),
        ],
        progress: null,
        accessibilityLabel: `${face.name} done today, ${face.sets} sets.${face.pr ? ` New best: ${face.pr}.` : ''}`,
      }
    case 'rest':
      return {
        caption: 'REST DAY',
        title: face.next ? `Next: ${face.next}` : 'Recover well',
        rows: [{ left: 'This week', right: `${face.week.done} of ${face.week.goal} workouts` }],
        progress: null,
        accessibilityLabel: `Rest day.${face.next ? ` Next: ${face.next}.` : ''}`,
      }
    case 'no-plan':
      return {
        caption: 'TRAINING',
        title: 'Plan your training',
        rows: [{ left: 'Pick a split, and each day shows here.', right: '' }],
        progress: null,
        accessibilityLabel: 'No training plan yet.',
      }
  }
}

/** The one line under the title when the card is two cells wide. */
const compactLine = (face: TrainFace): string | null => {
  switch (face.kind) {
    case 'plan':
      return face.lifts.length > 0 ? `${face.lifts.length} ${face.lifts.length === 1 ? 'lift' : 'lifts'}` : null
    case 'live':
      return face.lift && face.liftSets > 0
        ? `Set ${face.setNo} of ${face.liftSets}${face.prefill ? ` · ${face.prefill}` : ''}`
        : `${face.done}/${face.total} sets`
    case 'done':
      return [`${face.sets} ${face.sets === 1 ? 'set' : 'sets'}`, face.volume].filter(Boolean).join(' · ')
    case 'rest':
      return `${face.week.done} of ${face.week.goal} this week`
    case 'no-plan':
      return 'Pick a split in the app.'
  }
}

const TrainRow: React.FC<{ row: TrainText['rows'][number]; palette: WidgetPalette; width: number }> = ({
  row,
  palette,
  width,
}) => (
  <FlexWidget style={{ width, flexDirection: 'row', alignItems: 'center' }}>
    <FlexWidget style={{ flex: 1 }}>
      <TextWidget
        text={row.left}
        allowFontScaling={false}
        maxLines={1}
        truncate="END"
        style={{ fontFamily: FONT.medium, fontSize: 12, color: row.quiet ? palette.textSecondary : palette.text }}
      />
    </FlexWidget>
    {row.right ? (
      <TextWidget
        text={row.right}
        allowFontScaling={false}
        maxLines={1}
        // Last time's numbers in the dimmer shade, the way the app prefills the next set.
        style={{ fontFamily: FONT.semibold, fontSize: 12, color: row.dim ? palette.textMuted : palette.textSecondary, marginLeft: 8 }}
      />
    ) : null}
  </FlexWidget>
)

/**
 * Sets done of total: one segment per set while they fit, else one bar. Only drawn with at
 * least one set: the widget library cannot take a component that renders nothing.
 */
const SetBar: React.FC<{ done: number; total: number; palette: WidgetPalette; width: number }> = ({
  done,
  total,
  palette,
  width,
}) => {
  const gap = 2
  if (total <= 30 && (width - gap * (total - 1)) / total >= 4) {
    const each = Math.floor((width - gap * (total - 1)) / total)
    return (
      <FlexWidget style={{ flexDirection: 'row', flexGap: gap }}>
        {Array.from({ length: total }, (_, i) => (
          <FlexWidget
            key={i}
            style={{ width: each, height: 5, borderRadius: 2, backgroundColor: i < done ? palette.accent : palette.track }}
          />
        ))}
      </FlexWidget>
    )
  }
  const filled = Math.round((width * Math.min(done, total)) / total)
  return (
    <FlexWidget style={{ width, height: 5, borderRadius: 2, backgroundColor: palette.track, flexDirection: 'row' }}>
      {filled > 0 ? <FlexWidget style={{ width: filled, height: 5, borderRadius: 2, backgroundColor: palette.accent }} /> : null}
    </FlexWidget>
  )
}

const TrainFaceView: React.FC<{ face: TrainFace; palette: WidgetPalette; width: number; height: number }> = ({
  face,
  palette,
  width,
  height,
}) => {
  const titleSize = height >= 120 ? 26 : 22
  const titleLine = titleSize === 26 ? 33 : 28
  const barRoom = face.kind === 'live' ? 9 : 0
  const room = height - CAPTION - titleLine - 4 - barRoom
  const rowsThatFit = Math.max(0, Math.floor((room + ROW_GAP) / (ROW + ROW_GAP)))
  const text = trainText(face, rowsThatFit)
  const rows = text.rows.slice(0, rowsThatFit)
  const right =
    face.kind === 'live' ? (
      <TextWidget
        text={face.total > 0 ? `${face.done}/${face.total} sets` : `${face.lifts} ${face.lifts === 1 ? 'lift' : 'lifts'}`}
        allowFontScaling={false}
        style={{ fontFamily: FONT.semibold, fontSize: 12, color: palette.textSecondary }}
      />
    ) : (
      <Dots week={face.week} palette={palette} />
    )
  return (
    <FlexWidget style={{ width, height, justifyContent: 'center' }}>
      <FlexWidget style={{ width, flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flex: 1, marginRight: 8 }}>
          <Caption text={text.caption} palette={palette} />
        </FlexWidget>
        {right}
      </FlexWidget>
      <TextWidget
        text={text.title}
        allowFontScaling={false}
        maxLines={1}
        truncate="END"
        style={{ fontFamily: FONT.display, fontSize: titleSize, color: palette.text }}
      />
      {rows.length > 0 ? (
        <FlexWidget style={{ width, marginTop: 4, flexGap: ROW_GAP }}>
          {rows.map((row, i) => (
            <TrainRow key={i} row={row} palette={palette} width={width} />
          ))}
        </FlexWidget>
      ) : null}
      {text.progress && text.progress.total > 0 && height - CAPTION - titleLine >= 9 ? (
        <FlexWidget style={{ marginTop: 4 }}>
          <SetBar done={text.progress.done} total={text.progress.total} palette={palette} width={width} />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  )
}

/* ---------- The card ---------- */

const Shell: React.FC<{
  palette: WidgetPalette
  size: WidgetSize
  route: string
  accessibilityLabel: string
  paddingVertical?: number
  children: React.ReactNode
}> = ({ palette, size, route, accessibilityLabel, paddingVertical = PAD, children }) => (
  <FlexWidget
    clickAction="OPEN_URI"
    clickActionData={{ uri: widgetLink(route) }}
    accessibilityLabel={accessibilityLabel}
    style={{
      width: size.width,
      height: size.height,
      backgroundColor: palette.surface,
      borderRadius: Math.min(24, size.height / 2),
      paddingHorizontal: PAD,
      paddingVertical,
    }}
  >
    {children}
  </FlexWidget>
)

export const OneWidget: React.FC<{ model: OneModel; half: Half; size: WidgetSize; palette: WidgetPalette }> = ({
  model,
  half,
  size,
  palette,
}) => {
  const inner = { width: size.width - PAD * 2, height: size.height - PAD * 2 }

  if (model.kind === 'empty') {
    const oneLine = inner.height < 42
    return (
      <Shell palette={palette} size={size} route={TODAY_ROUTE} accessibilityLabel="Open MacroFit to set your targets">
        <FlexWidget style={{ width: inner.width, height: inner.height, justifyContent: 'center' }}>
          {oneLine ? null : (
            <TextWidget text="MacroFit" allowFontScaling={false} style={{ fontFamily: FONT.display, fontSize: 18, color: palette.text }} />
          )}
          <TextWidget
            text={oneLine ? 'Open MacroFit to set your targets.' : 'Open the app to set your targets.'}
            allowFontScaling={false}
            maxLines={oneLine ? 1 : 2}
            truncate="END"
            style={{ fontFamily: FONT.medium, fontSize: 12, color: palette.textMuted, ...(oneLine ? {} : { marginTop: 2 }) }}
          />
        </FlexWidget>
      </Shell>
    )
  }

  const food = model.food
  const over = food.eaten > food.goal
  const foodLabel =
    model.afterWorkout !== null
      ? `Workout done. ${model.afterWorkout} grams of protein to go.`
      : over
        ? `${formatNumber(food.eaten - food.goal)} kilocalories over today's ${formatNumber(food.goal)}.`
        : `${formatNumber(food.goal - food.eaten)} kilocalories left of ${formatNumber(food.goal)}.`
  const label =
    half === 'food' ? `${foodLabel} Open Today.` : `${trainText(model.train, 3).accessibilityLabel} Open Training.`
  const route = half === 'food' ? TODAY_ROUTE : '/training'
  const hands = handsFor(model, half)

  /*
    One row high: the face's one line and as many round buttons as fit. Four from about four
    cells wide; with room for two, the button that switches halves and the half's own action;
    with room for one, the switch. Under 65dp (OnePlus leaves a one-row widget 40dp, see
    render.tsx) the caption goes and the padding shrinks to one line.
  */
  if (inner.height - ACTION_ROW < CAPTION + 27) {
    const tight = size.height < PAD * 2 + CAPTION + 26
    const button = tight ? Math.max(24, Math.min(BUTTON, size.height - 8)) : BUTTON
    const paddingVertical = tight ? Math.max(2, Math.floor((size.height - button) / 2)) : PAD
    const row = { width: inner.width, height: size.height - paddingVertical * 2 }
    const faceWidth = tight ? 130 : 96
    const fit = Math.floor((row.width - faceWidth + BUTTON_GAP) / (button + BUTTON_GAP))
    const other = hands.find(h => h.key === (half === 'food' ? 'train' : 'food'))!
    const own = half === 'food' ? hands.find(h => h.key === 'water')! : hands.find(h => h.key === 'train')!
    const shown = fit >= 4 ? hands : fit >= 2 ? (half === 'food' ? [own, other] : [other, own]) : fit >= 1 ? [other] : []
    const face =
      half === 'food' ? (
        model.afterWorkout !== null && !tight ? (
          <Figure caption="PROTEIN TO GO" value={`${model.afterWorkout} g`} palette={palette} size={20} />
        ) : (
          <Headline model={food} palette={palette} size={20} align="start" inline={tight} />
        )
      ) : (
        <FlexWidget>
          {tight ? null : <Caption text={trainText(model.train, 0).caption} palette={palette} />}
          <TextWidget
            text={trainText(model.train, 0).title}
            allowFontScaling={false}
            maxLines={1}
            truncate="END"
            style={{ fontFamily: FONT.display, fontSize: 18, color: palette.text }}
          />
        </FlexWidget>
      )
    return (
      <Shell palette={palette} size={size} route={route} accessibilityLabel={label} paddingVertical={paddingVertical}>
        <FlexWidget style={{ width: row.width, height: row.height, flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget style={{ flex: 1, marginRight: 8 }}>{face}</FlexWidget>
          {shown.length > 0 ? (
            <FlexWidget style={{ flexDirection: 'row', flexGap: BUTTON_GAP }}>
              {shown.map(hand => (
                <HandButton key={hand.key} hand={hand} palette={palette} size={button} />
              ))}
            </FlexWidget>
          ) : null}
        </FlexWidget>
      </Shell>
    )
  }

  // Two cells wide: the face alone; the card opens its half.
  if (inner.width < 176) {
    if (half === 'food') {
      const ring = Math.max(40, Math.min(96, inner.width, inner.height - (6 + CAPTION + 26)))
      return (
        <Shell palette={palette} size={size} route={route} accessibilityLabel={label}>
          <FlexWidget style={{ width: inner.width, height: inner.height, alignItems: 'center', justifyContent: 'center' }}>
            <Ring model={food} palette={palette} size={ring} />
            <FlexWidget style={{ marginTop: 6 }}>
              {model.afterWorkout !== null ? (
                <Figure caption="PROTEIN TO GO" value={`${model.afterWorkout} g`} palette={palette} size={20} />
              ) : (
                <Headline model={food} palette={palette} size={20} align="center" />
              )}
            </FlexWidget>
          </FlexWidget>
        </Shell>
      )
    }
    const text = trainText(model.train, 2)
    return (
      <Shell palette={palette} size={size} route={route} accessibilityLabel={label}>
        <FlexWidget style={{ width: inner.width, height: inner.height, justifyContent: 'center' }}>
          <Caption text={text.caption} palette={palette} />
          <TextWidget
            text={text.title}
            allowFontScaling={false}
            maxLines={2}
            truncate="END"
            style={{ fontFamily: FONT.display, fontSize: 20, color: palette.text }}
          />
          {compactLine(model.train) ? (
            <TextWidget
              text={compactLine(model.train)!}
              allowFontScaling={false}
              maxLines={1}
              truncate="END"
              style={{ fontFamily: FONT.medium, fontSize: 12, color: palette.textSecondary, marginTop: 2 }}
            />
          ) : null}
        </FlexWidget>
      </Shell>
    )
  }

  const top = inner.height - ACTION_ROW
  const each = Math.floor((inner.width - BUTTON_GAP * (hands.length - 1)) / hands.length)
  return (
    <Shell palette={palette} size={size} route={route} accessibilityLabel={label}>
      <FlexWidget style={{ width: inner.width, height: inner.height }}>
        {half === 'food' ? (
          <FoodFace model={model} palette={palette} width={inner.width} height={top} />
        ) : (
          <TrainFaceView face={model.train} palette={palette} width={inner.width} height={top} />
        )}
        <FlexWidget style={{ marginTop: 10, width: inner.width, flexDirection: 'row', flexGap: BUTTON_GAP }}>
          {hands.map(hand => (
            <HandButton key={hand.key} hand={hand} palette={palette} width={each} />
          ))}
        </FlexWidget>
      </FlexWidget>
    </Shell>
  )
}
