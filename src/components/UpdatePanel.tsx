import React, { useState } from 'react'
import { View } from 'react-native'
import { Download, RefreshCw } from 'lucide-react-native'

import {
  checkForUpdate,
  downloadAndInstall,
  updatesConfigured,
  type UpdateManifest,
} from '@/lib/appUpdate'
import { useTheme } from '@/theme/useTheme'
import { spacing } from '@/theme/tokens'
import { Body } from './Text'
import { Button } from './Button'

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
  const [available, setAvailable] = useState<UpdateManifest | null>(null)

  const configured = updatesConfigured()

  const check = () => {
    setBusy(true)
    setError(null)
    setStatus(null)
    void checkForUpdate()
      .then(result => {
        setAvailable(result.available)
        setStatus(
          result.available
            ? `Version ${result.available.version} is available. You have ${result.currentVersion}.`
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
    setStatus('Downloading…')
    void downloadAndInstall(available)
      .then(() => {
        // Resolving means Android has the file and has taken over. Whether it installs is now
        // between the user and the system installer, so this must not claim success.
        setStatus('Android is asking you to confirm the install.')
      })
      .catch((err: unknown) => {
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
      {configured ? null : (
        <Body size={13} tone="secondary">
          No update source is set for this build, so it cannot check for new versions. It will
          need reinstalling by hand to update.
        </Body>
      )}

      {status ? (
        <Body size={13} tone="secondary">
          {status}
        </Body>
      ) : null}

      {error ? (
        <Body size={13} style={{ color: theme.status.critical }}>
          {error}
        </Body>
      ) : null}

      {configured ? (
        available ? (
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
        )
      ) : null}
    </View>
  )
}
