import React from 'react'
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget'
import { iconSvg } from './art'
import { widgetLink } from './links'
import type { TrainingModel, WeekDots } from './model'
import { FONT, type WidgetPalette } from './palette'
import type { WidgetSize } from './TodayWidget'

/*
  What training is up next, and a button that starts it.

  "Start" begins the session straight from the home screen — Training opens on the live
  workout rather than on a card asking to be tapped again. Everything else about the widget
  opens Training as it is.

  The button sits beside the day's name rather than under it, the way a media widget puts play
  beside the track: at the default 4×2 there is height for one row of content, not two.
*/

const PAD = 12
const BUTTON = 34
const trainingUri = { uri: widgetLink('/training') }

interface Content {
  title: string
  detail: string | null
  button: { label: string; uri: string; accessibilityLabel: string } | null
  accessibilityLabel: string
}

const contentFor = (model: TrainingModel): Content => {
  switch (model.kind) {
    case 'empty':
      return {
        title: 'MacroFit',
        detail: 'Open the app to get set up.',
        button: null,
        accessibilityLabel: 'Open MacroFit to get set up',
      }
    case 'no-plan':
      return {
        title: 'Plan your training',
        detail: 'Pick a split, and each day shows here.',
        button: { label: 'Set up', uri: widgetLink('/training'), accessibilityLabel: 'Set up a training plan' },
        accessibilityLabel: 'No training plan yet. Open Training.',
      }
    case 'active':
      return {
        title: model.name,
        detail: `In progress · ${model.setsDone} ${model.setsDone === 1 ? 'set' : 'sets'} done`,
        button: { label: 'Resume', uri: widgetLink('/training'), accessibilityLabel: 'Resume the workout' },
        accessibilityLabel: `${model.name} in progress, ${model.setsDone} sets done. Open Training.`,
      }
    case 'train':
      return {
        title: model.label,
        detail: model.lifts ?? 'Up next in your plan',
        button: {
          label: 'Start',
          uri: widgetLink(`/training?start=${encodeURIComponent(model.dayId)}`),
          accessibilityLabel: `Start ${model.label}`,
        },
        accessibilityLabel: `${model.label} is up today${model.lifts ? `: ${model.lifts}` : ''}. Open Training.`,
      }
    case 'rest':
    case 'done': {
      const title = model.kind === 'rest' ? 'Rest day' : 'Done for today'
      const next = model.nextLabel && model.nextWhen ? `Next: ${model.nextLabel}, ${model.nextWhen}` : null
      return {
        title,
        detail: next,
        button: null,
        accessibilityLabel: `${title}.${next ? ` ${next}.` : ''} Open Training.`,
      }
    }
  }
}

export const Dots: React.FC<{ week: WeekDots; palette: WidgetPalette }> = ({ week, palette }) => (
  <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
    <TextWidget
      text={`${week.done}/${week.goal}`}
      allowFontScaling={false}
      style={{ fontFamily: FONT.semibold, fontSize: 12, color: palette.textSecondary, marginRight: 8 }}
    />
    <FlexWidget style={{ flexDirection: 'row', flexGap: 4 }}>
      {week.days.map((trained, i) => (
        <FlexWidget
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: trained ? palette.accent : palette.track,
            // Today is ringed, so an untrained today still reads as "this one".
            ...(i === week.todayIndex && !trained
              ? { borderWidth: 1, borderColor: palette.textSecondary }
              : {}),
          }}
        />
      ))}
    </FlexWidget>
  </FlexWidget>
)

const StartButton: React.FC<{
  button: NonNullable<Content['button']>
  palette: WidgetPalette
  width?: number
  height?: number
}> = ({ button, palette, width, height = BUTTON }) => (
  <FlexWidget
    clickAction="OPEN_URI"
    clickActionData={{ uri: button.uri }}
    accessibilityLabel={button.accessibilityLabel}
    style={{
      height,
      ...(width === undefined ? { paddingHorizontal: 16 } : { width }),
      borderRadius: height / 2,
      backgroundColor: palette.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <SvgWidget svg={iconSvg('play', 13, palette.accentOn)} style={{ width: 13, height: 13 }} />
    <TextWidget
      text={button.label}
      allowFontScaling={false}
      style={{ fontFamily: FONT.semibold, fontSize: 13, color: palette.accentOn, marginLeft: 6 }}
    />
  </FlexWidget>
)

/** Title (Fraunces, ~1.3× its size) over a 16dp detail line. */
const Title: React.FC<{ content: Content; palette: WidgetPalette; size: number; detailLines: number }> = ({
  content,
  palette,
  size,
  detailLines,
}) => (
  <FlexWidget style={{ width: 'match_parent' }}>
    <TextWidget
      text={content.title}
      allowFontScaling={false}
      maxLines={1}
      truncate="END"
      style={{ fontFamily: FONT.display, fontSize: size, color: palette.text }}
    />
    {content.detail && detailLines > 0 ? (
      <TextWidget
        text={content.detail}
        allowFontScaling={false}
        maxLines={detailLines}
        truncate="END"
        style={{ fontFamily: FONT.medium, fontSize: 12, color: palette.textSecondary, marginTop: 1 }}
      />
    ) : null}
  </FlexWidget>
)

export const TrainingWidget: React.FC<{ model: TrainingModel; size: WidgetSize; palette: WidgetPalette }> = ({
  model,
  size,
  palette,
}) => {
  const content = contentFor(model)
  const week = 'week' in model ? model.week : null
  const inner = { width: size.width - PAD * 2, height: size.height - PAD * 2 }

  const shell = (children: React.ReactNode, paddingVertical = PAD) => (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={trainingUri}
      accessibilityLabel={content.accessibilityLabel}
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

  // The button needs ~90dp; under 170 it would squeeze the title out, and the card itself
  // still opens Training.
  const titleRow = (titleSize: number, detailLines = 1, buttonHeight = BUTTON) => (
    <FlexWidget style={{ width: inner.width, flexDirection: 'row', alignItems: 'center' }}>
      <FlexWidget style={{ flex: 1, marginRight: 10 }}>
        <Title content={content} palette={palette} size={titleSize} detailLines={detailLines} />
      </FlexWidget>
      {content.button && inner.width >= 170 ? (
        <StartButton button={content.button} palette={palette} height={buttonHeight} />
      ) : null}
    </FlexWidget>
  )

  /*
    One row high: what is next, and the button. Under 65dp the title and its detail line (24 +
    17) no longer fit inside the padding — OnePlus leaves a one-row widget 40dp (see render.tsx)
    — so the title goes alone, on one line of at most 32dp with the padding cut to match.
  */
  if (inner.height < 72) {
    const tight = size.height < PAD * 2 + 41
    const button = tight ? Math.max(24, Math.min(BUTTON, size.height - 8)) : BUTTON
    const paddingVertical = tight ? Math.max(2, Math.floor((size.height - button) / 2)) : PAD
    return shell(
      <FlexWidget
        style={{ width: inner.width, height: size.height - paddingVertical * 2, justifyContent: 'center' }}
      >
        {titleRow(18, tight ? 0 : 1, button)}
      </FlexWidget>,
      paddingVertical
    )
  }

  // Two cells wide: header, title, and the button across the bottom.
  if (inner.width < 176) {
    return shell(
      <FlexWidget style={{ width: inner.width, height: inner.height }}>
        <FlexWidget style={{ width: inner.width, flex: 1, justifyContent: 'center' }}>
          <Title content={content} palette={palette} size={20} detailLines={2} />
        </FlexWidget>
        {content.button ? <StartButton button={content.button} palette={palette} width={inner.width} /> : null}
      </FlexWidget>
    )
  }

  return shell(
    <FlexWidget style={{ width: inner.width, height: inner.height }}>
      <FlexWidget style={{ width: inner.width, flexDirection: 'row', alignItems: 'center' }}>
        <SvgWidget svg={iconSvg('dumbbell', 14, palette.accent)} style={{ width: 14, height: 14 }} />
        <TextWidget
          text="Training"
          allowFontScaling={false}
          style={{ fontFamily: FONT.semibold, fontSize: 12, color: palette.textSecondary, marginLeft: 6 }}
        />
        <FlexWidget style={{ flex: 1 }} />
        {week ? <Dots week={week} palette={palette} /> : null}
      </FlexWidget>
      <FlexWidget style={{ width: inner.width, flex: 1, justifyContent: 'center' }}>
        {titleRow(inner.height >= 120 ? 26 : 22)}
      </FlexWidget>
    </FlexWidget>
  )
}
