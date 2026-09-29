import React, { useState } from 'react'
import { Pressable, View } from 'react-native'
import * as Application from 'expo-application'
import { Download, RefreshCw } from 'lucide-react-native'

import { checkForUpdate, downloadAndInstall, type AvailableRelease } from '@/lib/appUpdate'
import { publishAvailableUpdate } from '@/hooks/useAvailableUpdate'
import { useTheme } from '@/theme/useTheme'
import { HIT_SIZE, radius, spacing } from '@/theme/tokens'
import { Body } from './Text'
import { Button } from './Button'
import { RichText } from './RichText'

/** Megabytes to one decimal. Binary, because that is what a phone's storage screen reports. */
const formatMb = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`

const describeAvailable = (release: AvailableRelease, currentVersion: string): string =>
  // The size is named up front. This is a sideloaded APK, not a Play Store delta, so it is the
  // whole app every time — and someone on mobile data deserves to learn that before the
  // transfer rather than from their bill.
  `Version ${release.version} is available. You have ${currentVersion}.` +
  (release.sizeBytes === null ? '' : ` The download is ${formatMb(release.sizeBytes)}.`)

/**
 * The update control, for a build that has no store behind it.
 *
 * Every state is written out rather than left to a spinner, because the failure modes here are
 * not interchangeable: no host configured, host unreachable, already current, and a download
 * waiting on the user in Android's installer are four different things, and "something went
 * wrong" would leave the user unable to tell which.
 *
 * `initial` is a release the launch check already found (the Today header's update icon), so
 * the panel opens ready to install instead of asking the user to check for what they were just
 * told exists. The launch check itself never prompts; it only decides whether that icon shows.
 */
/** How much of the release notes shows before "Show all". */
const NOTES_PREVIEW_HEIGHT = 180

export const UpdatePanel: React.FC<{
  initial?: AvailableRelease | null
  /** Show the release notes in full: on the update screen they ARE the content. */
  expandNotes?: boolean
}> = ({ initial = null, expandNotes = false }) => {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(() =>
    initial ? describeAvailable(initial, Application.nativeApplicationVersion ?? '—') : null
  )
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<AvailableRelease | null>(initial)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [notesClipped, setNotesClipped] = useState(false)
  /** 0 to 1 while downloading, null otherwise. */
  const [progress, setProgress] = useState<number | null>(null)

  const check = () => {
    setBusy(true)
    setError(null)
    setStatus(null)
    void checkForUpdate()
      .then(result => {
        setAvailable(result.available)
        publishAvailableUpdate(result.available)
        setStatus(
          result.available
            ? describeAvailable(result.available, result.currentVersion)
            : `You are on the newest build (${result.currentVersion}).`
        )
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'The update check failed.')
      })
      .finally(() => setBusy(false))
  }

  const install = () => {
    if (!available) return
    setBusy(true)
    setError(null)
    setProgress(null)
    setStatus('Starting…')
    void downloadAndInstall(available, report => {
      setProgress(report.fraction)
      setStatus(
        report.fraction === null
          ? `Downloading… ${formatMb(report.written)}`
          : `Downloading… ${Math.round(report.fraction * 100)}%`,
      )
    })
      .then(({ downloaded }) => {
        setProgress(null)
        // Resolving means Android has the file and has taken over. Whether it installs is now
        // between the user and the system installer, so this must not claim success.
        //
        // The two cases are worth distinguishing: someone who dismissed the prompt and pressed
        // again needs to know the app did not spend their data a second time, or they will
        // assume it did and stop trusting the button.
        setStatus(
          downloaded
            ? 'Android is asking you to confirm the install.'
            : 'Already downloaded. Android is asking you to confirm the install.',
        )
      })
      .catch((err: unknown) => {
        setProgress(null)
        setError(
          err instanceof Error
            ? `${err.message} If Android refused, allow this app to install unknown apps in your settings.`
            : 'The download failed.'
        )
      })
      .finally(() => setBusy(false))
  }

  return (
    <View style={{ gap: spacing.md }}>
      {status ? (
        <Body size={13} tone="secondary">
          {status}
        </Body>
      ) : null}

      {/*
        A determinate bar, because the alternative is a spinner that looks identical at ten
        seconds and at four minutes. On a slow connection that is indistinguishable from a hang,
        and the user's only move is to kill the app, which discards the partial file.
      */}
      {progress !== null ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          style={{
            height: 5,
            borderRadius: radius.pill,
            backgroundColor: theme.trackMuted,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${Math.round(progress * 100)}%`,
              height: '100%',
              borderRadius: radius.pill,
              backgroundColor: theme.brand,
            }}
          />
        </View>
      ) : null}

      {/*
        What is actually in the release.

        These notes were fetched from GitHub and dropped on the floor, so the only way to learn
        what an update contained was to leave the app and find the release page. Asking someone
        to install a hundred and fifty megabytes without telling them what changed is asking for
        trust that costs nothing to earn.
      */}
      {available?.notes && !busy ? (
        <View style={{ gap: spacing.xs }}>
          {/*
            Clipped, not just capped. This had a maxHeight and no overflow rule, so long notes
            kept drawing past the box — over the Download button and the rows below it. A
            preview with a "Show all" toggle, rather than a scroll box inside a scrolling
            screen, which fights the page's own scroll for the same finger.
          */}
          <View
            onLayout={event => {
              if (!notesExpanded) setNotesClipped(event.nativeEvent.layout.height >= NOTES_PREVIEW_HEIGHT)
            }}
            style={{
              borderRadius: radius.control,
              borderWidth: 1,
              borderColor: theme.border,
              padding: spacing.md,
              maxHeight: expandNotes || notesExpanded ? undefined : NOTES_PREVIEW_HEIGHT,
              overflow: 'hidden',
            }}
          >
            {/* Through the shared renderer: these notes are Markdown from GitHub, and a plain
                Body would print the same literal hashes and asterisks the chat used to. */}
            <RichText text={available.notes} color={theme.textSecondary} size={12} />
          </View>
          {!expandNotes && (notesClipped || notesExpanded) ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setNotesExpanded(value => !value)}
              hitSlop={8}
              style={{ alignSelf: 'flex-start', minHeight: HIT_SIZE, justifyContent: 'center' }}
            >
              <Body size={13} weight="semibold" tone="brand">
                {notesExpanded ? 'Show less' : "Show all of what's new"}
              </Body>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Body size={13} style={{ color: theme.status.critical }}>
          {error}
        </Body>
      ) : null}

      {available ? (
          <Button
            label="Download and install"
            onPress={install}
            loading={busy}
            disabled={busy}
            icon={<Download size={15} color={theme.brandOn} strokeWidth={2} />}
          />
      ) : (
        <Button
          label={busy ? 'Checking…' : 'Check for updates'}
          variant="secondary"
          onPress={check}
          loading={busy}
          disabled={busy}
          icon={<RefreshCw size={15} color={theme.text} strokeWidth={2} />}
        />
      )}
    </View>
  )
}
