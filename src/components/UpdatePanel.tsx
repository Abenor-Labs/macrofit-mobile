import React, { useState } from 'react'
import { View } from 'react-native'
import { Download, RefreshCw } from 'lucide-react-native'

import { checkForUpdate, downloadAndInstall, type AvailableRelease } from '@/lib/appUpdate'
import { useTheme } from '@/theme/useTheme'
import { radius, spacing } from '@/theme/tokens'
import { Body } from './Text'
import { Button } from './Button'
import { RichText } from './RichText'

/** Megabytes to one decimal. Binary, because that is what a phone's storage screen reports. */
const formatMb = (bytes: number): string => `${(bytes / 1048576).toFixed(1)} MB`

/**
 * The update control, for a build that has no store behind it.
 *
 * Every state is written out rather than left to a spinner, because the failure modes here are
 * not interchangeable: no host configured, host unreachable, already current, and a download
 * waiting on the user in Android's installer are four different things, and "something went
 * wrong" would leave the user unable to tell which.
 *
 * Nothing is checked automatically. A background check that offered an APK on launch would be
 * asking to replace the app before the user has done the thing they opened it for, and the check
 * costs a request against a host that may not exist yet.
 */
export const UpdatePanel: React.FC = () => {
  const theme = useTheme()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<AvailableRelease | null>(null)
  /** 0 to 1 while downloading, null otherwise. */
  const [progress, setProgress] = useState<number | null>(null)

  const check = () => {
    setBusy(true)
    setError(null)
    setStatus(null)
    void checkForUpdate()
      .then(result => {
        setAvailable(result.available)
        setStatus(
          result.available
            ? // The size is named up front. This is a sideloaded APK, not a Play Store delta,
              // so it is the whole app every time — and someone on mobile data deserves to
              // learn that before the transfer rather than from their bill.
              `Version ${result.available.version} is available. You have ${result.currentVersion}.` +
                (result.available.sizeBytes === null
                  ? ''
                  : ` The download is ${formatMb(result.available.sizeBytes)}.`)
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
        <View
          style={{
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: theme.border,
            padding: spacing.md,
            maxHeight: 220,
          }}
        >
          {/* Through the shared renderer: these notes are Markdown from GitHub, and a plain
              Body would print the same literal hashes and asterisks the chat used to. */}
          <RichText text={available.notes} color={theme.textSecondary} size={12} />
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
